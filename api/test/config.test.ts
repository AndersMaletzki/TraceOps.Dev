import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config.js";

const apiKeyHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("getConfig", () => {
  it("accepts and normalizes a SHA-256 API key hash", () => {
    const config = getConfig({
      TRACEOPS_API_KEY: apiKeyHash.toUpperCase(),
      TRACEOPS_API_KEY_HASH_SECRET: "super-secret",
      TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true"
    });

    expect(config.apiKey).toBe(apiKeyHash);
    expect(config.apiKeyHashSecret).toBe("super-secret");
    expect(config.usersTableName).toBe("TraceOpsUsers");
    expect(config.tenantsTableName).toBe("TraceOpsTenants");
    expect(config.tenantMembersTableName).toBe("TraceOpsTenantMembers");
    expect(config.apiKeysTableName).toBe("TraceOpsApiKeys");
    expect(config.enableOptimizedWorkItemLookupWrites).toBe(false);
    expect(config.preferOptimizedWorkItemLookups).toBe(false);
  });

  it("accepts identity table name overrides", () => {
    const config = getConfig({
      TRACEOPS_API_KEY: apiKeyHash,
      TRACEOPS_API_KEY_HASH_SECRET: "super-secret",
      TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
      TRACEOPS_TABLE_USERS: "UsersLocal",
      TRACEOPS_TABLE_TENANTS: "TenantsLocal",
      TRACEOPS_TABLE_TENANT_MEMBERS: "TenantMembersLocal",
      TRACEOPS_TABLE_API_KEYS: "ApiKeysLocal",
      TRACEOPS_LOG_ANALYTICS_WORKSPACE_ID: " workspace-id ",
      TRACEOPS_ENABLE_OPTIMIZED_WORKITEM_LOOKUP_WRITES: " true ",
      TRACEOPS_PREFER_OPTIMIZED_WORKITEM_LOOKUPS: "1"
    });

    expect(config.usersTableName).toBe("UsersLocal");
    expect(config.tenantsTableName).toBe("TenantsLocal");
    expect(config.tenantMembersTableName).toBe("TenantMembersLocal");
    expect(config.apiKeysTableName).toBe("ApiKeysLocal");
    expect(config.logAnalyticsWorkspaceId).toBe("workspace-id");
    expect(config.enableOptimizedWorkItemLookupWrites).toBe(true);
    expect(config.preferOptimizedWorkItemLookups).toBe(true);
  });

  it("rejects a raw API key value", () => {
    expect(() =>
      getConfig({
        TRACEOPS_API_KEY: "local-dev-key",
        TRACEOPS_API_KEY_HASH_SECRET: "super-secret",
        TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true"
      })
    ).toThrow("TRACEOPS_API_KEY must be a lowercase SHA-256 hex value");
  });

  it("requires the personal API key hash secret", () => {
    expect(() =>
      getConfig({
        TRACEOPS_API_KEY: apiKeyHash,
        TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true"
      })
    ).toThrow("TRACEOPS_API_KEY_HASH_SECRET is required");
  });
});
