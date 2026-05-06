import { HttpRequest } from "@azure/functions";
import { describe, expect, it } from "vitest";

const localDevKeyHash = "ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c";

function request(headers: Record<string, string> = {}, query: Record<string, string> = {}): HttpRequest {
  return {
    headers: new Headers(headers),
    query: new URLSearchParams(query)
  } as unknown as HttpRequest;
}

describe("website-facing endpoint authentication", () => {
  it("requires x-api-key for app work items", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { listAppWorkItems } = await import("../src/functions/workitems.js");

    const response = await listAppWorkItems(request({ "x-traceops-user-key": "github|123456" }), {} as never);

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("requires x-api-key for admin user metrics", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { getUserMetrics } = await import("../src/functions/admin.js");

    const response = await getUserMetrics(request(), {} as never);

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("requires x-api-key for admin issue metrics", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { getIssueMetrics } = await import("../src/functions/admin.js");

    const response = await getIssueMetrics(request(), {} as never);

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("requires x-api-key for admin request metrics", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { getRequestMetrics } = await import("../src/functions/admin.js");

    const response = await getRequestMetrics(request(), {} as never);

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });
});
