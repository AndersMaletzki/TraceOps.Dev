import { HttpRequest } from "@azure/functions";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TraceOpsConfig } from "../src/config.js";

const localDevKeyHash = "ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c";
const unsupportedAuthError =
  "Tenant-scoped work item routes require Authorization: Bearer <personal-api-key>. Raw x-api-key access is only supported for backend-owned website routes.";

function request(
  {
    headers = {},
    query = {},
    body,
    params = {}
  }: {
    headers?: Record<string, string>;
    query?: Record<string, string>;
    body?: unknown;
    params?: Record<string, string>;
  } = {}
): HttpRequest {
  return {
    headers: new Headers(headers),
    query: new URLSearchParams(query),
    params,
    json: async () => body
  } as unknown as HttpRequest;
}

function configWithApiKey(apiKey: string): TraceOpsConfig {
  return {
    apiKey,
    apiKeyHashSecret: "super-secret",
    storageConnectionString: "UseDevelopmentStorage=true",
    workItemsTableName: "WorkItems",
    workItemEventsTableName: "WorkItemEvents",
    usersTableName: "TraceOpsUsers",
    tenantsTableName: "TraceOpsTenants",
    tenantMembersTableName: "TraceOpsTenantMembers",
    apiKeysTableName: "TraceOpsApiKeys"
  };
}

function createWorkItemsService() {
  return {
    create: vi.fn(async () => ({ workItemId: "ITEM~1" })),
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({ workItemId: "ITEM~1" })),
    getNext: vi.fn(async () => ({ workItemId: "ITEM~1" })),
    updateStatus: vi.fn(async () => ({ workItemId: "ITEM~1" })),
    claim: vi.fn(async () => ({ workItemId: "ITEM~1" })),
    updateLinks: vi.fn(async () => ({ workItemId: "ITEM~1" })),
    listAppWorkItems: vi.fn(async () => ({ items: [], count: 0 }))
  };
}

afterEach(async () => {
  const { setWorkItemsModuleTestOverrides } = await import("../src/functions/workitems.js");
  setWorkItemsModuleTestOverrides(undefined);
});

describe("tenant-scoped work item auth enforcement", () => {
  it("rejects raw global x-api-key access for every tenant-scoped work item route", async () => {
    const { setWorkItemsModuleTestOverrides, createWorkItem, listWorkItems, getWorkItem, getNextWorkItem, updateWorkItemStatus, claimWorkItem, updateWorkItemLinks } =
      await import("../src/functions/workitems.js");
    const service = createWorkItemsService();

    setWorkItemsModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service,
      authService: {
        assertTenantMember: vi.fn(async () => undefined)
      },
      apiKeyService: {
        authenticatePersonalApiKey: vi.fn(async () => {
          throw new Error("not used");
        })
      }
    });

    const operations = [
      () =>
        createWorkItem(
          request({
            headers: { "x-api-key": "local-dev-key" },
            body: {
              tenantId: "tenant",
              repoId: "repo",
              workItemType: "Issue",
              category: "Bug",
              title: "Broken API",
              description: "Broken API",
              severity: "High",
              source: "manual",
              createdBy: "codex"
            }
          }),
          {} as never
        ),
      () =>
        listWorkItems(
          request({
            headers: { "x-api-key": "local-dev-key" },
            query: { tenantId: "tenant", repoId: "repo" }
          }),
          {} as never
        ),
      () =>
        getWorkItem(
          request({
            headers: { "x-api-key": "local-dev-key" },
            query: { tenantId: "tenant", repoId: "repo" },
            params: { workItemId: "ITEM~1" }
          }),
          {} as never
        ),
      () =>
        getNextWorkItem(
          request({
            headers: { "x-api-key": "local-dev-key" },
            query: { tenantId: "tenant", repoId: "repo" }
          }),
          {} as never
        ),
      () =>
        updateWorkItemStatus(
          request({
            headers: { "x-api-key": "local-dev-key" },
            params: { workItemId: "ITEM~1" },
            body: {
              tenantId: "tenant",
              repoId: "repo",
              status: "InProgress",
              actor: "codex"
            }
          }),
          {} as never
        ),
      () =>
        claimWorkItem(
          request({
            headers: { "x-api-key": "local-dev-key" },
            params: { workItemId: "ITEM~1" },
            body: {
              tenantId: "tenant",
              repoId: "repo",
              claimedBy: "codex"
            }
          }),
          {} as never
        ),
      () =>
        updateWorkItemLinks(
          request({
            headers: { "x-api-key": "local-dev-key" },
            params: { workItemId: "ITEM~1" },
            body: {
              tenantId: "tenant",
              repoId: "repo",
              externalBranchName: "codex/test"
            }
          }),
          {} as never
        )
    ];

    for (const operation of operations) {
      await expect(operation()).resolves.toMatchObject({
        status: 403,
        jsonBody: { error: unsupportedAuthError }
      });
    }

    expect(service.create).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
    expect(service.get).not.toHaveBeenCalled();
    expect(service.getNext).not.toHaveBeenCalled();
    expect(service.updateStatus).not.toHaveBeenCalled();
    expect(service.claim).not.toHaveBeenCalled();
    expect(service.updateLinks).not.toHaveBeenCalled();
  });

  it("keeps personal bearer auth working for tenant-scoped reads", async () => {
    const { setWorkItemsModuleTestOverrides, listWorkItems } = await import("../src/functions/workitems.js");
    const service = createWorkItemsService();
    service.list.mockResolvedValue([
      {
        workItemId: "ITEM~1",
        tenantId: "tenant",
        repoId: "repo"
      }
    ]);

    setWorkItemsModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service,
      authService: {
        assertTenantMember: vi.fn(async () => undefined)
      },
      apiKeyService: {
        authenticatePersonalApiKey: vi.fn(async () => ({
          kind: "personal" as const,
          apiKeyId: "key_123",
          tenantId: "tenant",
          userKey: "github|123456",
          scopes: ["workitems:read"]
        }))
      }
    });

    const response = await listWorkItems(
      request({
        headers: { authorization: "Bearer trc_live_abc123def456_secret" },
        query: { tenantId: "tenant", repoId: "repo" }
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        count: 1
      }
    });
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant",
        repoId: "repo",
        callerUserKey: "github|123456"
      })
    );
  });

  it("keeps personal bearer auth working for tenant-scoped writes", async () => {
    const { setWorkItemsModuleTestOverrides, createWorkItem } = await import("../src/functions/workitems.js");
    const service = createWorkItemsService();
    const assertTenantMember = vi.fn(async () => undefined);

    setWorkItemsModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service,
      authService: {
        assertTenantMember
      },
      apiKeyService: {
        authenticatePersonalApiKey: vi.fn(async () => ({
          kind: "personal" as const,
          apiKeyId: "key_123",
          tenantId: "tenant",
          userKey: "github|123456",
          scopes: ["workitems:create"]
        }))
      }
    });

    const response = await createWorkItem(
      request({
        headers: { authorization: "Bearer trc_live_abc123def456_secret" },
        body: {
          tenantId: "tenant",
          repoId: "repo",
          workItemType: "Issue",
          category: "Bug",
          title: "Broken API",
          description: "Broken API",
          severity: "High",
          source: "manual",
          createdBy: "codex"
        }
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 201,
      jsonBody: { workItemId: "ITEM~1" }
    });
    expect(assertTenantMember).toHaveBeenCalledWith("github|123456", "tenant");
    expect(service.create).toHaveBeenCalled();
  });
});
