import { HttpRequest } from "@azure/functions";
import { describe, expect, it, vi } from "vitest";
import { ApiKeyAuthenticationError } from "../src/apiKeyService.js";
import { TenantAccessDeniedError } from "../src/authService.js";
import { TraceOpsConfig } from "../src/config.js";
import {
  authenticate,
  authenticateTrustedRequest,
  errorResponse,
  parseAppWorkItemFiltersFromQuery,
  parseCallerUserKey
} from "../src/http.js";

const localDevKeyHash = "ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c";

function requestWithHeaders(headers: Record<string, string> = {}): HttpRequest {
  return {
    headers: new Headers(headers)
  } as unknown as HttpRequest;
}

function requestWithQueryAndHeaders(query: Record<string, string>, headers: Record<string, string> = {}): HttpRequest {
  return {
    headers: new Headers(headers),
    query: new URLSearchParams(query)
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

describe("authenticateTrustedRequest", () => {
  it("accepts a matching raw API key value", () => {
    const response = authenticateTrustedRequest(
      requestWithHeaders({ "x-api-key": "local-dev-key" }),
      configWithApiKey(localDevKeyHash)
    );

    expect(response).toBeUndefined();
  });

  it("rejects the stored SHA-256 API key value as a request key", () => {
    const response = authenticateTrustedRequest(
      requestWithHeaders({ "x-api-key": localDevKeyHash }),
      configWithApiKey(localDevKeyHash)
    );

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects a missing API key", () => {
    const response = authenticateTrustedRequest(requestWithHeaders(), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects an incorrect SHA-256 API key value", () => {
    const response = authenticateTrustedRequest(
      requestWithHeaders({ "x-api-key": "wrong-key" }),
      configWithApiKey(localDevKeyHash)
    );

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });
});

describe("authenticate", () => {
  it("returns global auth context for a valid trusted API key", async () => {
    const auth = await authenticate(
      requestWithHeaders({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456",
        "x-traceops-tenant-id": "tenant-123"
      }),
      configWithApiKey(localDevKeyHash)
    );

    expect(auth).toMatchObject({
      kind: "global",
      userKey: "github|123456",
      tenantId: "tenant-123",
      scopes: ["workitems:read", "workitems:create", "workitems:update"]
    });
  });

  it("returns personal auth context for a valid bearer API key", async () => {
    const apiKeyService = {
      authenticatePersonalApiKey: vi.fn().mockResolvedValue({
        kind: "personal",
        apiKeyId: "key_123",
        tenantId: "tenant-123",
        userKey: "github|123456",
        scopes: ["workitems:read"]
      })
    } as const;

    const auth = await authenticate(
      requestWithHeaders({ authorization: "Bearer trc_live_abc123def456_secret" }),
      configWithApiKey(localDevKeyHash),
      apiKeyService as never
    );

    expect(apiKeyService.authenticatePersonalApiKey).toHaveBeenCalledWith("trc_live_abc123def456_secret");
    expect(auth).toMatchObject({
      kind: "personal",
      apiKeyId: "key_123",
      tenantId: "tenant-123",
      userKey: "github|123456",
      scopes: ["workitems:read"]
    });
  });

  it("returns 401 when bearer authentication fails", async () => {
    const apiKeyService = {
      authenticatePersonalApiKey: vi.fn().mockRejectedValue(new ApiKeyAuthenticationError())
    } as const;

    const response = await authenticate(
      requestWithHeaders({ authorization: "Bearer trc_live_abc123def456_secret" }),
      configWithApiKey(localDevKeyHash),
      apiKeyService as never
    );

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });
});

describe("caller user parsing", () => {
  it("reads caller user keys from user-facing headers", () => {
    const request = requestWithQueryAndHeaders({}, { "x-traceops-user-key": "github|123456" });

    expect(parseCallerUserKey(request)).toBe("github|123456");
  });

  it("accepts the legacy x-user-key header during the compatibility window", () => {
    const request = requestWithQueryAndHeaders({}, { "x-user-key": "github|123456" });

    expect(parseCallerUserKey(request)).toBe("github|123456");
  });

  it("does not trust caller user keys from query parameters", () => {
    const request = requestWithQueryAndHeaders({ callerUserKey: "github|123456" });

    expect(parseCallerUserKey(request)).toBeUndefined();
  });

  it("requires a caller user key for app work item reads", () => {
    const request = requestWithQueryAndHeaders({ repoId: "AndersMaletzki/TraceOps.Dev" });

    expect(() => parseAppWorkItemFiltersFromQuery(request)).toThrow("callerUserKey is required");
  });

  it("allows app work item reads without a repoId", () => {
    const request = requestWithQueryAndHeaders({}, { "x-traceops-user-key": "github|123456" });

    expect(parseAppWorkItemFiltersFromQuery(request)).toMatchObject({
      callerUserKey: "github|123456",
      repoId: undefined,
      tenantId: undefined
    });
  });

  it("maps tenant membership failures to 403", () => {
    const response = errorResponse(new TenantAccessDeniedError("tenant"));

    expect(response).toMatchObject({
      status: 403,
      jsonBody: { error: "User is not a member of tenant: tenant" }
    });
  });
});
