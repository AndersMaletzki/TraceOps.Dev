import { describe, expect, it } from "vitest";
import { workItemTypes } from "../src/types.js";

describe("MCP work item model", () => {
  it("exposes the stabilized work item type enum", () => {
    expect(workItemTypes).toEqual(["Issue", "Feature", "AuditFinding"]);
  });
});
