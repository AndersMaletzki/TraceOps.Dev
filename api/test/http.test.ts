import { HttpRequest } from "@azure/functions";
import { describe, expect, it } from "vitest";
import { TraceOpsConfig } from "../src/config.js";
import { authenticate } from "../src/http.js";

const localDevKeyHash = "ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c";
const otherHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function requestWithApiKey(apiKey?: string): HttpRequest {
  return {
    headers: new Headers(apiKey === undefined ? {} : { "x-api-key": apiKey })
  } as unknown as HttpRequest;
}

function configWithApiKey(apiKey: string): TraceOpsConfig {
  return {
    apiKey,
    storageConnectionString: "UseDevelopmentStorage=true",
    workItemsTableName: "WorkItems",
    workItemEventsTableName: "WorkItemEvents"
  };
}

describe("authenticate", () => {
  it("accepts a matching SHA-256 API key value", () => {
    const response = authenticate(requestWithApiKey(localDevKeyHash), configWithApiKey(localDevKeyHash));

    expect(response).toBeUndefined();
  });

  it("rejects the old raw API key value", () => {
    const response = authenticate(requestWithApiKey("local-dev-key"), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects a missing API key", () => {
    const response = authenticate(requestWithApiKey(), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects an incorrect SHA-256 API key value", () => {
    const response = authenticate(requestWithApiKey(otherHash), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });

  it("rejects malformed non-SHA-256 API key values", () => {
    const response = authenticate(requestWithApiKey("not-a-sha-256-value"), configWithApiKey(localDevKeyHash));

    expect(response).toMatchObject({ status: 401, jsonBody: { error: "Unauthorized" } });
  });
});
