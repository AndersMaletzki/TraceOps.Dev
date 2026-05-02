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
