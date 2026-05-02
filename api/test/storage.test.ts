import { describe, expect, it } from "vitest";
import { partitionKey } from "../src/domain.js";
import { toStoredWorkItem, toWorkItem } from "../src/storage.js";

describe("storage mapping", () => {
  it("serializes arrays for Table Storage and restores API shape", () => {
    const stored = toStoredWorkItem(
      {
        tenantId: "tenant",
        repoId: "repo",
        workItemType: "Feature",
        category: "Idea",
        title: "Import audit output",
        description: "Create items from audit JSON.",
        severity: "Medium",
        status: "New",
        source: "manual",
        files: ["docs/architecture.md"],
        tags: ["audit"],
        createdBy: "codex"
      },
      "ITEM~20260501153000~abc123",
      "2026-05-01T15:30:00.000Z"
    );

    expect(stored.partitionKey).toBe(partitionKey("tenant", "repo"));
    expect(stored.partitionKey).toBe("TENANT~dGVuYW50~REPO~cmVwbw");
    expect(stored.rowKey).toBe("ITEM~20260501153000~abc123");
    expect(stored.files).toBe("[\"docs/architecture.md\"]");
    expect(toWorkItem(stored).files).toEqual(["docs/architecture.md"]);
    expect(toWorkItem(stored).tags).toEqual(["audit"]);
  });

  it("creates Azure Table-safe partition keys", () => {
    expect(partitionKey("tenant/#?", "owner/repo#main?")).not.toMatch(/[\\/#?\u0000-\u001F\u007F-\u009F]/);
  });

  it("maps missing optional stored fields to stable API defaults", () => {
    const stored = toStoredWorkItem(
      {
        tenantId: "tenant",
        repoId: "repo",
        workItemType: "AuditFinding",
        category: "Security",
        title: "Missing auth",
        description: "Endpoint needs auth.",
        severity: "High",
        source: "repo-audit",
        createdBy: "codex"
      },
      "ITEM~20260501153000~abc123",
      "2026-05-01T15:30:00.000Z"
    );

    delete stored.assignedTo;
    delete stored.claimedBy;
    delete stored.claimedAt;
    delete stored.claimExpiresAt;
    delete stored.externalBranchName;
    delete stored.externalCommitUrl;
    delete stored.externalPrUrl;

    expect(toWorkItem(stored)).toMatchObject({
      assignedTo: "",
      claimedBy: "",
      claimedAt: "",
      claimExpiresAt: "",
      externalBranchName: "",
      externalCommitUrl: "",
      externalPrUrl: ""
    });
  });
});
