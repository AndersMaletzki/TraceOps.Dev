import { describe, expect, it } from "vitest";
import { resolveTenantId } from "../src/context.js";

describe("resolveTenantId", () => {
  it("uses explicit tenantId before the configured default", () => {
    expect(resolveTenantId("explicit", "default")).toEqual({
      ok: true,
      tenantId: "explicit"
    });
  });

  it("uses the configured default tenantId when input is omitted", () => {
    expect(resolveTenantId(undefined, "default")).toEqual({
      ok: true,
      tenantId: "default"
    });
  });

  it("returns a structured error when tenantId cannot be resolved", () => {
    expect(resolveTenantId()).toEqual({
      ok: false,
      error: {
        code: "missing_tenant_id",
        message: "tenantId is required when TRACEOPS_DEFAULT_TENANT_ID is not configured."
      }
    });
  });
});
