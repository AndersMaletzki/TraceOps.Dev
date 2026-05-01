import { describe, expect, it } from "vitest";
import { parseCreateWorkItemInput, ValidationError } from "../src/validation.js";

describe("parseCreateWorkItemInput", () => {
  it("validates and normalizes a create payload", () => {
    const input = parseCreateWorkItemInput({
      tenantId: " tenant ",
      repoId: "repo",
      workItemType: "Issue",
      category: "Security",
      title: "Missing auth",
      description: "Endpoint needs auth.",
      severity: "High",
      source: "audit",
      files: [" api/index.ts ", ""],
      tags: ["security"],
      createdBy: "codex"
    });

    expect(input).toMatchObject({
      tenantId: "tenant",
      repoId: "repo",
      status: undefined,
      files: ["api/index.ts"],
      tags: ["security"]
    });
  });

  it("rejects invalid enum values", () => {
    expect(() =>
      parseCreateWorkItemInput({
        tenantId: "tenant",
        repoId: "repo",
        workItemType: "Task",
        category: "Security",
        title: "Invalid",
        description: "Invalid",
        severity: "High",
        source: "audit",
        createdBy: "codex"
      })
    ).toThrow(ValidationError);
  });
});
