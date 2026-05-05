import { describe, expect, it, vi } from "vitest";
import { TenantAccessDeniedError } from "../src/authService.js";
import { CreateWorkItemInput } from "../src/domain.js";
import { StoredWorkItemResult, toStoredWorkItem, toWorkItem, WorkItemConflictError, WorkItemRepository } from "../src/storage.js";
import { WorkItemService } from "../src/workItemService.js";

const createInput: CreateWorkItemInput = {
  tenantId: "tenant",
  repoId: "repo",
  workItemType: "Issue",
  category: "Bug",
  title: "Broken API",
  description: "The API returns a bad response.",
  severity: "High",
  status: "New",
  source: "audit",
  files: [],
  tags: [],
  createdBy: "codex"
};

function createStored(overrides: Partial<StoredWorkItemResult> = {}): StoredWorkItemResult {
  return {
    ...toStoredWorkItem(createInput, "ITEM~20260501153000~abc123", "2026-05-01T15:30:00.000Z"),
    etag: "etag",
    ...overrides
  };
}

describe("WorkItemService", () => {
  it("writes an append-only event when a work item is created", async () => {
    const createEvent = vi.fn(async () => undefined);
    const repository = {
      createWorkItem: vi.fn(async (entity: StoredWorkItemResult) => toWorkItem(entity)),
      createEvent
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);
    const created = await service.create({
      ...createInput,
      workItemType: "AuditFinding",
      source: "repo-audit"
    });

    expect(created.workItemType).toBe("AuditFinding");
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: expect.stringMatching(/^ITEM~\d{14}~/),
        eventId: expect.stringMatching(/^EVT~\d{14}~/),
        eventType: "Created",
        workItemType: "AuditFinding",
        status: "New",
        actor: "codex"
      })
    );
  });

  it("allows a tenant member to list tenant work items", async () => {
    const repository = {
      listWorkItems: vi.fn(async () => [createStored()])
    } as unknown as WorkItemRepository;
    const authService = {
      assertTenantMember: vi.fn(async () => undefined),
      listUserTenants: vi.fn()
    };

    const service = new WorkItemService(repository, authService);
    const items = await service.list({
      tenantId: "tenant",
      repoId: "repo",
      callerUserKey: "github|123456",
      limit: 25
    });

    expect(items).toHaveLength(1);
    expect(authService.assertTenantMember).toHaveBeenCalledWith("github|123456", "tenant");
    expect(repository.listWorkItems).toHaveBeenCalledWith("tenant", "repo", 250);
  });

  it("rejects a non-member before listing tenant work items", async () => {
    const repository = {
      listWorkItems: vi.fn()
    } as unknown as WorkItemRepository;
    const authService = {
      assertTenantMember: vi.fn(async () => {
        throw new TenantAccessDeniedError("tenant");
      }),
      listUserTenants: vi.fn()
    };

    const service = new WorkItemService(repository, authService);

    await expect(
      service.list({
        tenantId: "tenant",
        repoId: "repo",
        callerUserKey: "github|other",
        limit: 25
      })
    ).rejects.toThrow(TenantAccessDeniedError);
    expect(repository.listWorkItems).not.toHaveBeenCalled();
  });

  it("returns app work items for a selected repoId after tenant membership validation", async () => {
    const repository = {
      listRepositoryIdsForTenant: vi.fn(async () => ["repo"]),
      listWorkItems: vi.fn(async () => [createStored()]),
      listWorkItemsForTenant: vi.fn()
    } as unknown as WorkItemRepository;
    const authService = {
      assertTenantMember: vi.fn(async () => undefined),
      listUserTenants: vi.fn(),
      getTenant: vi.fn(async () => ({
        tenantId: "tenant",
        tenantType: "personal" as const,
        name: "Octo Cat",
        createdByUserKey: "github|123456",
        createdAtUtc: "2026-05-01T15:30:00.000Z"
      }))
    };

    const service = new WorkItemService(repository, authService);
    const result = await service.listAppWorkItems({
      tenantId: "tenant",
      repoId: "repo",
      callerUserKey: "github|123456",
      limit: 25
    });

    expect(result).toMatchObject({
      caller: { userKey: "github|123456" },
      activeTenant: { tenantId: "tenant" },
      repoId: "repo",
      repositoryOptions: [{ tenantId: "tenant", repoId: "repo", label: "repo" }],
      count: 1
    });
    expect(authService.assertTenantMember).toHaveBeenCalledWith("github|123456", "tenant");
    expect(repository.listWorkItems).toHaveBeenCalledWith("tenant", "repo", 250);
  });

  it("returns app work items across accessible tenant repositories when repoId is omitted", async () => {
    const repository = {
      listRepositoryIdsForTenant: vi.fn(async (tenantId: string) =>
        tenantId === "tenant-a" ? ["repo-a"] : ["repo-b"]
      ),
      listWorkItemsForTenant: vi.fn(async (tenantId: string) => [
        createStored({
          tenantId,
          repoId: tenantId === "tenant-a" ? "repo-a" : "repo-b",
          workItemId: `ITEM~20260501153000~${tenantId}`
        })
      ]),
      listWorkItems: vi.fn()
    } as unknown as WorkItemRepository;
    const authService = {
      assertTenantMember: vi.fn(),
      listUserTenants: vi.fn(async () => [
        { tenantId: "tenant-a", userKey: "github|123456", role: "owner" as const, createdAtUtc: "" },
        { tenantId: "tenant-b", userKey: "github|123456", role: "member" as const, createdAtUtc: "" }
      ]),
      getTenant: vi.fn(async () => ({
        tenantId: "tenant-a",
        tenantType: "personal" as const,
        name: "Tenant A",
        createdByUserKey: "github|123456",
        createdAtUtc: "2026-05-01T15:30:00.000Z"
      }))
    };

    const service = new WorkItemService(repository, authService);
    const result = await service.listAppWorkItems({
      callerUserKey: "github|123456",
      limit: 25
    });

    expect(result.repoId).toBeNull();
    expect(result.count).toBe(2);
    expect(result.repositoryOptions).toEqual([
      { tenantId: "tenant-a", repoId: "repo-a", label: "repo-a" },
      { tenantId: "tenant-b", repoId: "repo-b", label: "repo-b" }
    ]);
    expect(repository.listWorkItemsForTenant).toHaveBeenCalledWith("tenant-a", 250);
    expect(repository.listWorkItemsForTenant).toHaveBeenCalledWith("tenant-b", 250);
  });

  it("rejects app work items for an explicit tenant when the caller is not a member", async () => {
    const repository = {
      listRepositoryIdsForTenant: vi.fn(),
      listWorkItems: vi.fn(),
      listWorkItemsForTenant: vi.fn()
    } as unknown as WorkItemRepository;
    const authService = {
      assertTenantMember: vi.fn(async () => {
        throw new TenantAccessDeniedError("tenant");
      }),
      listUserTenants: vi.fn(),
      getTenant: vi.fn()
    };

    const service = new WorkItemService(repository, authService);

    await expect(
      service.listAppWorkItems({
        tenantId: "tenant",
        callerUserKey: "github|other",
        limit: 25
      })
    ).rejects.toThrow(TenantAccessDeniedError);
    expect(repository.listWorkItemsForTenant).not.toHaveBeenCalled();
  });

  it("keeps API-key-only listing working when no caller user key is supplied", async () => {
    const repository = {
      listWorkItems: vi.fn(async () => [createStored()])
    } as unknown as WorkItemRepository;
    const authService = {
      assertTenantMember: vi.fn(),
      listUserTenants: vi.fn()
    };

    const service = new WorkItemService(repository, authService);
    const items = await service.list({
      tenantId: "tenant",
      repoId: "repo",
      limit: 25
    });

    expect(items).toHaveLength(1);
    expect(authService.assertTenantMember).not.toHaveBeenCalled();
  });

  it("validates tenant membership before reading one work item", async () => {
    const repository = {
      getWorkItem: vi.fn(async () => createStored())
    } as unknown as WorkItemRepository;
    const authService = {
      assertTenantMember: vi.fn(async () => undefined),
      listUserTenants: vi.fn()
    };

    const service = new WorkItemService(repository, authService);
    const item = await service.get("tenant", "repo", "ITEM~20260501153000~abc123", "github|123456");

    expect(item.workItemId).toBe("ITEM~20260501153000~abc123");
    expect(authService.assertTenantMember).toHaveBeenCalledWith("github|123456", "tenant");
  });

  it("writes an append-only event when status changes", async () => {
    const stored = createStored();
    const createEvent = vi.fn(async () => undefined);
    const repository = {
      getWorkItem: vi.fn(async () => stored),
      replaceWorkItem: vi.fn(async (entity: StoredWorkItemResult) => toWorkItem(entity)),
      createEvent
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);
    const updated = await service.updateStatus("ITEM~20260501153000~abc123", {
      tenantId: "tenant",
      repoId: "repo",
      status: "InProgress",
      actor: "codex"
    });

    expect(updated.status).toBe("InProgress");
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: "ITEM~20260501153000~abc123",
        previousStatus: "New",
        newStatus: "InProgress",
        actor: "codex"
      })
    );
  });

  it("rejects a claim when another active claim exists", async () => {
    const stored = createStored({
      claimedBy: "other-agent",
      claimExpiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const repository = {
      getWorkItem: vi.fn(async () => stored),
      replaceWorkItem: vi.fn(),
      createEvent: vi.fn(async () => undefined)
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);

    await expect(
      service.claim("ITEM~20260501153000~abc123", {
        tenantId: "tenant",
        repoId: "repo",
        claimedBy: "codex"
      })
    ).rejects.toThrow(WorkItemConflictError);
  });

  it("allows replacing an expired claim", async () => {
    const stored = createStored({
      claimedBy: "other-agent",
      claimExpiresAt: new Date(Date.now() - 60_000).toISOString()
    });
    const createEvent = vi.fn(async () => undefined);
    const repository = {
      getWorkItem: vi.fn(async () => stored),
      replaceWorkItem: vi.fn(async (entity: StoredWorkItemResult) => toWorkItem(entity)),
      createEvent
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);
    const updated = await service.claim("ITEM~20260501153000~abc123", {
      tenantId: "tenant",
      repoId: "repo",
      claimedBy: "codex"
    });

    expect(updated.claimedBy).toBe("codex");
    expect(new Date(updated.claimExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Claimed",
        claimedBy: "codex",
        claimExpiresAt: updated.claimExpiresAt,
        actor: "codex"
      })
    );
  });

  it("writes an append-only event when external links are updated", async () => {
    const stored = createStored();
    const createEvent = vi.fn(async () => undefined);
    const repository = {
      getWorkItem: vi.fn(async () => stored),
      replaceWorkItem: vi.fn(async (entity: StoredWorkItemResult) => toWorkItem(entity)),
      createEvent
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);
    const updated = await service.updateLinks("ITEM~20260501153000~abc123", {
      tenantId: "tenant",
      repoId: "repo",
      externalBranchName: "codex/model-stabilization",
      externalCommitUrl: "https://github.com/example/repo/commit/abc123",
      externalPrUrl: "https://github.com/example/repo/pull/42"
    });

    expect(updated.externalBranchName).toBe("codex/model-stabilization");
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "LinksUpdated",
        externalBranchName: "codex/model-stabilization",
        externalCommitUrl: "https://github.com/example/repo/commit/abc123",
        externalPrUrl: "https://github.com/example/repo/pull/42"
      })
    );
  });
});
