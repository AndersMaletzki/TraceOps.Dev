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
    apiKeysTableName: "TraceOpsApiKeys",
    enableOptimizedWorkItemLookupWrites: false,
    preferOptimizedWorkItemLookups: false
  };
}

afterEach(async () => {
  const { setAuthModuleTestOverrides } = await import("../src/functions/auth.js");
  const { setApiKeysModuleTestOverrides } = await import("../src/functions/apiKeys.js");
  const { setAdminModuleTestOverrides } = await import("../src/functions/admin.js");
  const { setWorkItemsModuleTestOverrides } = await import("../src/functions/workitems.js");
  setAuthModuleTestOverrides(undefined);
  setApiKeysModuleTestOverrides(undefined);
  setAdminModuleTestOverrides(undefined);
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

  it("exposes the backend-owned admin user metrics contract", async () => {
    const { getUserMetrics, setAdminModuleTestOverrides } = await import("../src/functions/admin.js");

    setAdminModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        assertAdminUser: async (userKey: string) => {
          expect(userKey).toBe("github|123456");
        },
        getUserMetrics: async () => ({
          totalUsers: 10,
          githubUsers: 6,
          microsoftUsers: 4,
          adminUsers: 2,
          usersCreatedLast7Days: 3,
          activeUsersLast30Days: 8
        }),
        getIssueMetrics: async () => {
          throw new Error("not used");
        },
        getRequestMetrics: async () => {
          throw new Error("not used");
        }
      }
    });

    const response = await getUserMetrics(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        totalUsers: 10,
        githubUsers: 6,
        microsoftUsers: 4,
        adminUsers: 2,
        usersCreatedLast7Days: 3,
        activeUsersLast30Days: 8
      }
    });
  });

  it("exposes the backend-owned admin issue metrics contract", async () => {
    const { getIssueMetrics, setAdminModuleTestOverrides } = await import("../src/functions/admin.js");

    setAdminModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        assertAdminUser: async (userKey: string) => {
          expect(userKey).toBe("github|123456");
        },
        getUserMetrics: async () => {
          throw new Error("not used");
        },
        getIssueMetrics: async () => ({
          totalIssues: 7,
          openIssues: 3,
          fixedIssues: 2,
          closedIssues: 2,
          issuesCreatedLast7Days: 1
        }),
        getRequestMetrics: async () => {
          throw new Error("not used");
        }
      }
    });

    const response = await getIssueMetrics(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        totalIssues: 7,
        openIssues: 3,
        fixedIssues: 2,
        closedIssues: 2,
        issuesCreatedLast7Days: 1
      }
    });
  });

  it("exposes the backend-owned admin request metrics contract", async () => {
    const { getRequestMetrics, setAdminModuleTestOverrides } = await import("../src/functions/admin.js");

    setAdminModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        assertAdminUser: async (userKey: string) => {
          expect(userKey).toBe("github|123456");
        },
        getUserMetrics: async () => {
          throw new Error("not used");
        },
        getIssueMetrics: async () => {
          throw new Error("not used");
        },
        getRequestMetrics: async () => ({
          requestsToday: 12,
          requestsLast7Days: 42,
          failedRequests: 3,
          averageResponseDurationMs: 128.5
        })
      }
    });

    const response = await getRequestMetrics(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        requestsToday: 12,
        requestsLast7Days: 42,
        failedRequests: 3,
        averageResponseDurationMs: 128.5
      }
    });
  });

  it("exposes the backend-owned admin health contract", async () => {
    const { getHealth, setAdminModuleTestOverrides } = await import("../src/functions/admin.js");

    setAdminModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        assertAdminUser: async (userKey: string) => {
          expect(userKey).toBe("github|123456");
        },
        getUserMetrics: async () => {
          throw new Error("not used");
        },
        getIssueMetrics: async () => {
          throw new Error("not used");
        },
        getRequestMetrics: async () => {
          throw new Error("not used");
        },
        getHealth: async () => ({
          status: "ok",
          checkedAtUtc: "2026-05-12T00:00:00.000Z",
          storage: {
            status: "ok",
            tables: {
              workItems: true,
              workItemEvents: true,
              users: true,
              tenants: true,
              tenantMembers: true,
              apiKeys: true
            }
          },
          telemetry: {
            status: "ok",
            logAnalyticsWorkspaceConfigured: true
          },
          runtimeConfig: {
            status: "ok",
            apiKeyResolved: true,
            apiKeyHashSecretResolved: true,
            storageConnectionStringResolved: true
          }
        }),
        getDiagnostics: async () => {
          throw new Error("not used");
        }
      }
    });

    const response = await getHealth(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        status: "ok",
        checkedAtUtc: "2026-05-12T00:00:00.000Z",
        storage: {
          status: "ok",
          tables: {
            workItems: true,
            workItemEvents: true,
            users: true,
            tenants: true,
            tenantMembers: true,
            apiKeys: true
          }
        },
        telemetry: {
          status: "ok",
          logAnalyticsWorkspaceConfigured: true
        },
        runtimeConfig: {
          status: "ok",
          apiKeyResolved: true,
          apiKeyHashSecretResolved: true,
          storageConnectionStringResolved: true
        }
      }
    });
  });

  it("exposes the backend-owned admin diagnostics contract", async () => {
    const { getDiagnostics, setAdminModuleTestOverrides } = await import("../src/functions/admin.js");

    setAdminModuleTestOverrides({
      config: configWithApiKey(localDevKeyHash),
      service: {
        assertAdminUser: async (userKey: string) => {
          expect(userKey).toBe("github|123456");
        },
        getUserMetrics: async () => {
          throw new Error("not used");
        },
        getIssueMetrics: async () => {
          throw new Error("not used");
        },
        getRequestMetrics: async () => {
          throw new Error("not used");
        },
        getHealth: async () => {
          throw new Error("not used");
        },
        getDiagnostics: async () => ({
          checkedAtUtc: "2026-05-12T00:00:00.000Z",
          health: {
            status: "ok",
            checkedAtUtc: "2026-05-12T00:00:00.000Z",
            storage: {
              status: "ok",
              tables: {
                workItems: true,
                workItemEvents: true,
                users: true,
                tenants: true,
                tenantMembers: true,
                apiKeys: true
              }
            },
            telemetry: {
              status: "ok",
              logAnalyticsWorkspaceConfigured: true
            },
            runtimeConfig: {
              status: "ok",
              apiKeyResolved: true,
              apiKeyHashSecretResolved: true,
              storageConnectionStringResolved: true
            }
          },
          requestMetrics: {
            requestsToday: 12,
            requestsLast7Days: 42,
            failedRequests: 3,
            averageResponseDurationMs: 128.5
          },
          dependencies: {
            storageTables: {
              workItems: "WorkItems",
              workItemEvents: "WorkItemEvents",
              users: "TraceOpsUsers",
              tenants: "TraceOpsTenants",
              tenantMembers: "TraceOpsTenantMembers",
              apiKeys: "TraceOpsApiKeys"
            },
            logAnalyticsWorkspaceConfigured: true,
            requiredRuntimeConfigResolved: true
          }
        })
      }
    });

    const response = await getDiagnostics(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        checkedAtUtc: "2026-05-12T00:00:00.000Z",
        health: {
          status: "ok",
          checkedAtUtc: "2026-05-12T00:00:00.000Z"
        },
        requestMetrics: {
          requestsToday: 12,
          requestsLast7Days: 42,
          failedRequests: 3,
          averageResponseDurationMs: 128.5
        },
        dependencies: {
          storageTables: {
            workItems: "WorkItems",
            workItemEvents: "WorkItemEvents",
            users: "TraceOpsUsers",
            tenants: "TraceOpsTenants",
            tenantMembers: "TraceOpsTenantMembers",
            apiKeys: "TraceOpsApiKeys"
          },
          logAnalyticsWorkspaceConfigured: true,
          requiredRuntimeConfigResolved: true
        }
      }
    });
  });
});
