import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config.js";

const validApiKeyHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("getConfig", () => {
  it("accepts a lowercase SHA-256 API key value", () => {
    const config = getConfig({
      TRACEOPS_API_KEY: validApiKeyHash,
      TRACEOPS_STORAGE_CONNECTION_STRING: "UseDevelopmentStorage=true"
    });

    expect(config.apiKey).toBe(validApiKeyHash);
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
