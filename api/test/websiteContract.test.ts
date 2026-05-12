import { HttpRequest } from "@azure/functions";
import { describe, expect, it } from "vitest";

const localDevKeyHash = "ed5a18fb8f807f996d649e379d3f35f39c543a91bdbf88c492f2ebd10d4df86c";

function request(headers: Record<string, string> = {}, body?: unknown): HttpRequest {
  return {
    headers: new Headers(headers),
    json: async () => body
  } as unknown as HttpRequest;
}

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

  it("requires trusted tenant headers to list personal API keys", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_API_KEY_HASH_SECRET = "super-secret";
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { listApiKeys } = await import("../src/functions/apiKeys.js");

    const response = await listApiKeys(
      request({
        "x-api-key": "local-dev-key",
        "x-traceops-user-key": "github|123456"
      }),
      {} as never
    );

    expect(response).toMatchObject({
      status: 400,
      jsonBody: { error: "x-traceops-tenant-id is required" }
    });
  });

  it("requires trusted tenant headers to revoke personal API keys", async () => {
    process.env.TRACEOPS_API_KEY = localDevKeyHash;
    process.env.TRACEOPS_API_KEY_HASH_SECRET = "super-secret";
    process.env.TRACEOPS_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true";
    const { revokeApiKey } = await import("../src/functions/apiKeys.js");

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
      status: 400,
      jsonBody: { error: "x-traceops-tenant-id is required" }
    });
  });
});
