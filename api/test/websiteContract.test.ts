import { HttpRequest } from "@azure/functions";
import { afterEach, describe, expect, it } from "vitest";
import type { TraceOpsConfig } from "../src/config.js";
import type { SyncUserResult } from "../src/domain.js";

const localDevKeyHash = "ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c";

function request(headers: Record<string, string> = {}, body?: unknown): HttpRequest {
  return {
    headers: new Headers(headers),
    query: new URLSearchParams(),
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

afterEach(async () => {
  const { setAuthModuleTestOverrides } = await import("../src/functions/auth.js");
  const { setApiKeysModuleTestOverrides } = await import("../src/functions/apiKeys.js");
  const { setWorkItemsModuleTestOverrides } = await import("../src/functions/workitems.js");
  setAuthModuleTestOverrides(undefined);
  setApiKeysModuleTestOverrides(undefined);
  setWorkItemsModuleTestOverrides(undefined);
});

describe("website-facing contract freeze", () => {
  it("requires x-api-key for trusted user sync", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_API_KEY_HASH_SECRET = "super-secret";
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { syncUser } = await import("../src/functions/auth.js");

    const response = await syncUser(
      request(
        {},
        {
          identityProvider: "github",
          providerUserId: "123456",
          userDetails: "octocat@example.com",
          roles: ["authenticated"]
        }
      ),
      {} as never
    );

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("preserves legacy sync fields while adding a formal bootstrap contract", async () => {
    const { setAuthModuleTestOverrides, syncUser } = await import("../src/functions/auth.js");
    const result: SyncUserResult = {
      user: {
        userKey: "github|123456",
        identityProvider: "github",
        providerUserId: "123456",
        userDetails: "octocat@example.com",
        displayName: "Octo Cat",
        createdAtUtc: "2026-05-12T00:00:00.000Z",
        lastLoginAtUtc: "2026-05-12T00:00:00.000Z",
        loginCount: 1,
        isAdmin: false
      },
      personalTenant: {
        tenantId: "personal~github~123456",
        tenantType: "personal",
        name: "Octo Cat",
        createdByUserKey: "github|123456",
        createdAtUtc: "2026-05-12T00:00:00.000Z"
      },
      memberships: [
        {
          tenantId: "personal~github~123456",
          userKey: "github|123456",
          role: "owner",
          createdAtUtc: "2026-05-12T00:00:00.000Z"
        }
      ],
      bootstrap: {
        user: {
          userKey: "github|123456",
          identityProvider: "github",
          providerUserId: "123456",
          userDetails: "octocat@example.com",
          displayName: "Octo Cat",
          createdAtUtc: "2026-05-12T00:00:00.000Z",
          lastLoginAtUtc: "2026-05-12T00:00:00.000Z",
          loginCount: 1,
          isAdmin: false
        },
        personalTenant: {
          tenantId: "personal~github~123456",
          tenantType: "personal",
          name: "Octo Cat",
          createdByUserKey: "github|123456",
          createdAtUtc: "2026-05-12T00:00:00.000Z"
        },
        memberships: [
          {
            tenantId: "personal~github~123456",
            userKey: "github|123456",
            role: "owner",
            createdAtUtc: "2026-05-12T00:00:00.000Z"
          }
        ]
      }
    };

    setAuthModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        syncUser: async () => result
      }
    });

    const response = await syncUser(
      request(
        { "x-api-key": "local-dev-key" },
        {
          identityProvider: "github",
          providerUserId: "123456",
          userDetails: "octocat@example.com",
          roles: ["authenticated"]
        }
      ),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        user: result.user,
        personalTenant: result.personalTenant,
        memberships: result.memberships,
        bootstrap: {
          user: result.user,
          personalTenant: result.personalTenant,
          memberships: result.memberships
        }
      }
    });
  });

  it("requires x-api-key for supported personal API key scopes", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_API_KEY_HASH_SECRET = "super-secret";
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { getSupportedScopes } = await import("../src/functions/auth.js");

    const response = await getSupportedScopes(request(), {} as never);

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("exposes supported personal API key scopes from the backend contract", async () => {
    const { getSupportedScopes, setAuthModuleTestOverrides } = await import("../src/functions/auth.js");

    setAuthModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        syncUser: async () => {
          throw new Error("not used");
        }
      }
    });

    const response = await getSupportedScopes(request({ "x-api-key": "local-dev-key" }), {} as never);

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        supportedPersonalApiKeyScopes: ["workitems:read", "workitems:create", "workitems:update"]
      }
    });
  });

  it("requires trusted caller headers to create personal API keys", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_API_KEY_HASH_SECRET = "super-secret";
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { createApiKey } = await import("../src/functions/apiKeys.js");

    const response = await createApiKey(
      request(
        { "x-api-key": "local-dev-key" },
        { name: "Codex CLI", scopes: ["workitems:read"] }
      ),
      {} as never
    );

    expect(response).toMatchObject({
      status: 400,
      jsonBody: { error: "x-traceops-user-key is required" }
    });
  });

  it("derives the active tenant when listing personal API keys without a tenant header", async () => {
    const { listApiKeys, setApiKeysModuleTestOverrides } = await import("../src/functions/apiKeys.js");

    setApiKeysModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        resolveTenantIdForUser: async (userKey: string, tenantId?: string) => {
          expect(userKey).toBe("github|123456");
          expect(tenantId).toBeUndefined();
          return "personal~github~123456";
        },
        createApiKey: async () => {
          throw new Error("not used");
        },
        listApiKeysForUser: async (tenantId: string, userKey: string) => {
          expect(tenantId).toBe("personal~github~123456");
          expect(userKey).toBe("github|123456");
          return [
            {
              apiKeyId: "key_123",
              tenantId,
              userKey,
              name: "Codex CLI",
              keyPrefix: "abc123def456",
              scopes: ["workitems:read"],
              createdAtUtc: "2026-05-12T00:00:00.000Z",
              expiresAtUtc: "",
              lastUsedAtUtc: "",
              revokedAtUtc: ""
            }
          ];
        },
        revokeApiKey: async () => {
          throw new Error("not used");
        }
      }
    });

    const response = await listApiKeys(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        items: [
          {
            apiKeyId: "key_123",
            tenantId: "personal~github~123456",
            userKey: "github|123456",
            name: "Codex CLI"
          }
        ]
      }
    });
  });

  it("derives the active tenant when revoking a personal API key without a tenant header", async () => {
    const { revokeApiKey, setApiKeysModuleTestOverrides } = await import("../src/functions/apiKeys.js");

    setApiKeysModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        resolveTenantIdForUser: async () => "personal~github~123456",
        createApiKey: async () => {
          throw new Error("not used");
        },
        listApiKeysForUser: async () => {
          throw new Error("not used");
        },
        revokeApiKey: async (tenantId: string, userKey: string, apiKeyId: string) => {
          expect(tenantId).toBe("personal~github~123456");
          expect(userKey).toBe("github|123456");
          expect(apiKeyId).toBe("key_123");
          return {
            apiKeyId,
            tenantId,
            userKey,
            name: "Codex CLI",
            keyPrefix: "abc123def456",
            scopes: ["workitems:read"],
            createdAtUtc: "2026-05-12T00:00:00.000Z",
            expiresAtUtc: "",
            lastUsedAtUtc: "",
            revokedAtUtc: "2026-05-12T01:00:00.000Z"
          };
        }
      }
    });

    const response = await revokeApiKey(
      {
        ...request({
          "x-api-key": "local-dev-key",
          "x-traceops-user-key": "github|123456"
        }),
        params: { apiKeyId: "key_123" }
      } as HttpRequest,
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        apiKeyId: "key_123",
        tenantId: "personal~github~123456",
        userKey: "github|123456",
        revokedAtUtc: "2026-05-12T01:00:00.000Z"
      }
    });
  });

  it("keeps the app workitems response shape while using backend-owned tenant resolution", async () => {
    const { listAppWorkItems, setWorkItemsModuleTestOverrides } = await import("../src/functions/workitems.js");

    setWorkItemsModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        create: async () => {
          throw new Error("not used");
        },
        list: async () => {
          throw new Error("not used");
        },
        get: async () => {
          throw new Error("not used");
        },
        getNext: async () => {
          throw new Error("not used");
        },
        updateStatus: async () => {
          throw new Error("not used");
        },
        claim: async () => {
          throw new Error("not used");
        },
        updateLinks: async () => {
          throw new Error("not used");
        },
        listAppWorkItems: async (filters) => {
          expect(filters).toMatchObject({
            callerUserKey: "github|123456",
            tenantId: undefined,
            repoId: undefined
          });
          return {
            caller: { userKey: "github|123456" },
            activeTenant: {
              tenantId: "personal~github~123456",
              tenantType: "personal",
              name: "Octo Cat",
              createdByUserKey: "github|123456",
              createdAtUtc: "2026-05-12T00:00:00.000Z"
            },
            repoId: null,
            repositoryOptions: [
              {
                tenantId: "personal~github~123456",
                repoId: "AndersMaletzki/TraceOps.Dev",
                label: "AndersMaletzki/TraceOps.Dev"
              }
            ],
            items: [],
            count: 0
          };
        }
      },
      authService: {
        assertTenantMember: async () => undefined
      },
      apiKeyService: {
        authenticatePersonalApiKey: async () => {
          throw new Error("not used");
        }
      }
    });

    const response = await listAppWorkItems(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        caller: { userKey: "github|123456" },
        activeTenant: { tenantId: "personal~github~123456" },
        repoId: null,
        repositoryOptions: [
          {
            tenantId: "personal~github~123456",
            repoId: "AndersMaletzki/TraceOps.Dev",
            label: "AndersMaletzki/TraceOps.Dev"
          }
        ],
        items: [],
        count: 0
      }
    });
  });
});
