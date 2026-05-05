import { HttpRequest } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { TenantAccessDeniedError } from "../src/authService.js";
import { TraceOpsConfig } from "../src/config.js";
import { authenticate, errorResponse, parseAppWorkItemFiltersFromQuery, parseCallerUserKey } from "../src/http.js";

const localDevKeyHash = "ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c";
const otherHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function requestWithApiKey(apiKey?: string): HttpRequest {
  return {
    headers: new Headers(apiKey === undefined ? {} : { "x-api-key": apiKey })
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
    storageConnectionString: "UseDevelopmentStorage=true",
    workItemsTableName: "WorkItems",
    workItemEventsTableName: "WorkItemEvents",
    usersTableName: "TraceOpsUsers",
    tenantsTableName: "TraceOpsTenants",
    tenantMembersTableName: "TraceOpsTenantMembers"
  };
}

describe("authenticate", () => {
  it("accepts a matching raw API key value", () => {
    const response = authenticate(requestWithApiKey("local-dev-key"), configWithApiKey(localDevKeyHash));

    expect(response).toBeUndefined();
  });

  it("rejects the stored SHA-256 API key value as a request key", () => {
    const response = authenticate(requestWithApiKey(localDevKeyHash), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects a missing API key", () => {
    const response = authenticate(requestWithApiKey(), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects an incorrect SHA-256 API key value", () => {
    const response = authenticate(requestWithApiKey("wrong-key"), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects when the configured API key is not a SHA-256 hash", () => {
    const response = authenticate(requestWithApiKey("local-dev-key"), configWithApiKey("not-a-sha-256-value"));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });
});

describe("caller user parsing", () => {
  it("reads caller user keys from user-facing headers", () => {
    const request = requestWithQueryAndHeaders({}, { "x-traceops-user-key": "github|123456" });

    expect(parseCallerUserKey(request)).toBe("github|123456");
  });

  it("requires a caller user key for app work item reads", () => {
    const request = requestWithQueryAndHeaders({ repoId: "AndersMaletzki/TraceOps.Dev" });

    expect(() => parseAppWorkItemFiltersFromQuery(request)).toThrow("callerUserKey is required");
  });

  it("maps tenant membership failures to 403", () => {
    const response = errorResponse(new TenantAccessDeniedError("tenant"));

    expect(response).toMatchObject({
      status: 403,
      jsonBody: { error: "User is not a member of tenant: tenant" }
    });
  });
});
