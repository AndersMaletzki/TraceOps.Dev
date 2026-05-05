import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config.js";

const apiKeyHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("getConfig", () => {
  it("accepts and normalizes a SHA-256 API key hash", () => {
    const config = getConfig({
      TRACEOPS_API_KEY: apiKeyHash.toUpperCase(),
      TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true"
    });

    expect(config.apiKey).toBe(apiKeyHash);
    expect(config.usersTableName).toBe("TraceOpsUsers");
    expect(config.tenantsTableName).toBe("TraceOpsTenants");
    expect(config.tenantMembersTableName).toBe("TraceOpsTenantMembers");
  });

  it("accepts identity table name overrides", () => {
    const config = getConfig({
      TRACEOPS_API_KEY: apiKeyHash,
      TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true",
      TRACEOPS_TABLE_USERS: "UsersLocal",
      TRACEOPS_TABLE_TENANTS: "TenantsLocal",
      TRACEOPS_TABLE_TENANT_MEMBERS: "TenantMembersLocal"
    });

    expect(config.usersTableName).toBe("UsersLocal");
    expect(config.tenantsTableName).toBe("TenantsLocal");
    expect(config.tenantMembersTableName).toBe("TenantMembersLocal");
  });

  it("rejects a raw API key value", () => {
    expect(() =>
      getConfig({
        TRACEOPS_API_KEY: "local-dev-key",
        TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true"
      })
    ).toThrow("TRACEOPS_API_KEY must be a lowercase SHA-256 hex value");
  });
});
