import { describe, expect, it } from "vitest";
import { getConfig } from "../src/config.js";

describe("getConfig", () => {
  it("accepts a raw API key value", () => {
    const config = getConfig({
      TRACEOPS_API_BASE_URL: "http://localhost:7071/api",
      TRACEOPS_API_KEY: "local-dev-key"
    });

    expect(config.apiKey).toBe("local-dev-key");
  });

  it("requires an API key value", () => {
    expect(() =>
      getConfig({
        TRACEOPS_API_BASE_URL: "http://localhost:7071/api"
      })
    ).toThrow("TRACEOPS_API_KEY is required");
  });
});
