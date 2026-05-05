import { describe, expect, it } from "vitest";
import {
  parseCategory,
  parseCreateWorkItemInput,
  parseSeverity,
  parseStatus,
  parseSyncUserInput,
  parseWorkItemType,
  ValidationError
} from "../src/validation.js";

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
      createdBy: "codex",
      createdByUserKey: " github|123456 ",
      assignedTo: "maintainer",
      assignedToUserKey: " github|789 "
    });

    expect(input).toMatchObject({
      tenantId: "tenant",
      repoId: "repo",
      status: undefined,
      files: ["api/index.ts"],
      tags: ["security"],
      createdByUserKey: "github|123456",
      assignedTo: "maintainer",
      assignedToUserKey: "github|789"
    });
  });

  it("accepts all public work item types", () => {
    expect(parseWorkItemType("Issue")).toBe("Issue");
    expect(parseWorkItemType("Feature")).toBe("Feature");
    expect(parseWorkItemType("AuditFinding")).toBe("AuditFinding");
  });

  it("defaults optional create fields", () => {
    const input = parseCreateWorkItemInput({
      tenantId: "tenant",
      repoId: "repo",
      workItemType: "AuditFinding",
      category: "Security",
      title: "Missing auth",
      description: "Endpoint needs auth.",
      severity: "High",
      source: "repo-audit",
      createdBy: "codex"
    });

    expect(input.status).toBeUndefined();
    expect(input.files).toEqual([]);
    expect(input.tags).toEqual([]);
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
    expect(() => parseCategory("Feature")).toThrow(ValidationError);
    expect(() => parseSeverity("Urgent")).toThrow(ValidationError);
    expect(() => parseStatus("Done")).toThrow(ValidationError);
  });
});

describe("parseSyncUserInput", () => {
  it("validates and normalizes a trusted user sync payload", () => {
    const input = parseSyncUserInput({
      identityProvider: " github ",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: " Octo Cat ",
      roles: [" Anonymous ", "Admin"]
    });

    expect(input).toEqual({
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octo Cat",
      roles: ["anonymous", "admin"]
    });
  });

  it("requires roles and storage-safe identity key segments", () => {
    expect(() =>
      parseSyncUserInput({
        identityProvider: "github",
        providerUserId: "123/456",
        userDetails: "octocat@example.com",
        roles: []
      })
    ).toThrow(ValidationError);

    expect(() =>
      parseSyncUserInput({
        identityProvider: "github",
        providerUserId: "123456",
        userDetails: "octocat@example.com"
      })
    ).toThrow(ValidationError);
  });
});
