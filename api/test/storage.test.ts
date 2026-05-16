import { describe, expect, it } from "vitest";
import { partitionKey } from "../src/domain.js";
import {
  buildWorkItemSummaryFilter,
  toStoredTenantRepoLookup,
  toStoredTenantWorkItemLookup,
  apiKeyPartitionKey,
  apiKeyRowKey,
  toApiKey,
  toApiKeyMetadata,
  toStoredApiKey,
  tenantMemberPartitionKey,
  tenantMemberRowKey,
  toStoredTenant,
  toStoredTenantMember,
  toStoredUser,
  toStoredWorkItem,
  toTenant,
  toTenantMember,
  toWorkItemSummary,
  workItemSummarySelectFields,
  toWorkItemFromTenantLookup,
  toUser,
  toWorkItem
} from "../src/storage.js";

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
        createdBy: "codex",
        createdByUserKey: "github|123456",
        assignedTo: "maintainer",
        assignedToUserKey: "github|789"
      },
      "ITEM~20260501153000~abc123",
      "2026-05-01T15:30:00.000Z"
    );

    expect(stored.partitionKey).toBe(partitionKey("tenant", "repo"));
    expect(stored.partitionKey).toBe("TENANT~dGVuYW50~REPO~cmVwbw");
    expect(stored.rowKey).toBe("ITEM~20260501153000~abc123");
    expect(stored.files).toBe("[\"docs/architecture.md\"]");
    expect(stored.createdByUserKey).toBe("github|123456");
    expect(stored.assignedToUserKey).toBe("github|789");
    expect(toWorkItem(stored).files).toEqual(["docs/architecture.md"]);
    expect(toWorkItem(stored).tags).toEqual(["audit"]);
    expect(toWorkItem(stored)).toMatchObject({
      createdByUserKey: "github|123456",
      assignedTo: "maintainer",
      assignedToUserKey: "github|789"
    });
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
    delete stored.createdByUserKey;
    delete stored.assignedToUserKey;
    delete stored.claimedBy;
    delete stored.claimedAt;
    delete stored.claimExpiresAt;
    delete stored.externalBranchName;
    delete stored.externalCommitUrl;
    delete stored.externalPrUrl;

    expect(toWorkItem(stored)).toMatchObject({
      assignedTo: "",
      createdByUserKey: "",
      assignedToUserKey: "",
      claimedBy: "",
      claimedAt: "",
      claimExpiresAt: "",
      externalBranchName: "",
      externalCommitUrl: "",
      externalPrUrl: ""
    });
  });

  it("maps compact work item summaries without large detail fields", () => {
    const stored = toStoredWorkItem(
      {
        tenantId: "tenant",
        repoId: "repo",
        workItemType: "Issue",
        category: "Bug",
        title: "Broken API",
        description: "Large markdown body",
        severity: "High",
        status: "InProgress",
        source: "manual",
        files: ["api/src/storage.ts"],
        tags: ["large"],
        createdBy: "codex",
        assignedToUserKey: "github|789",
        externalPrUrl: "https://github.com/AndersMaletzki/TraceOps.Dev/pull/1"
      },
      "ITEM~20260501153000~abc123",
      "2026-05-01T15:30:00.000Z"
    );
    stored.claimedBy = "github|123456";

    const summary = toWorkItemSummary(stored);

    expect(summary).toEqual({
      workItemId: "ITEM~20260501153000~abc123",
      repositoryId: "repo",
      title: "Broken API",
      status: "InProgress",
      severity: "High",
      workItemType: "Issue",
      category: "Bug",
      assignedToUserKey: "github|789",
      claimedByUserKey: "github|123456",
      createdAt: "2026-05-01T15:30:00.000Z",
      updatedAt: "2026-05-01T15:30:00.000Z",
      externalLink: "https://github.com/AndersMaletzki/TraceOps.Dev/pull/1"
    });
    expect(summary).not.toHaveProperty("description");
    expect(summary).not.toHaveProperty("files");
    expect(summary).not.toHaveProperty("tags");
  });

  it("defines Azure Table summary projections without large fields", () => {
    expect(workItemSummarySelectFields).toEqual([
      "tenantId",
      "repoId",
      "workItemId",
      "workItemType",
      "category",
      "title",
      "severity",
      "status",
      "assignedToUserKey",
      "claimedBy",
      "createdAt",
      "updatedAt",
      "externalPrUrl",
      "externalCommitUrl",
      "externalBranchName"
    ]);
    expect(workItemSummarySelectFields).not.toContain("description");
    expect(workItemSummarySelectFields).not.toContain("files");
    expect(workItemSummarySelectFields).not.toContain("tags");
  });

  it("pushes summary filters into the Azure Table query", () => {
    expect(
      buildWorkItemSummaryFilter({
        tenantId: "tenant",
        repoId: "repo",
        workItemId: "ITEM~1",
        status: "InProgress",
        severity: "High",
        workItemType: "Issue",
        category: "Bug"
      })
    ).toBe(
      "PartitionKey eq 'TENANT~dGVuYW50~REPO~cmVwbw' and RowKey eq 'ITEM~1' and status eq 'InProgress' and severity eq 'High' and workItemType eq 'Issue' and category eq 'Bug'"
    );
  });

  it("creates additive tenant lookup rows from a primary work item without changing the primary row shape", () => {
    const stored = toStoredWorkItem(
      {
        tenantId: "tenant",
        repoId: "repo",
        workItemType: "Feature",
        category: "Performance",
        title: "Optimize scans",
        description: "Add lookup rows.",
        severity: "Medium",
        status: "Accepted",
        source: "planning",
        files: ["api/src/storage.ts"],
        tags: ["optimization"],
        createdBy: "codex"
      },
      "ITEM~20260501153000~abc123",
      "2026-05-01T15:30:00.000Z"
    );

    const repoLookup = toStoredTenantRepoLookup(stored);
    const itemLookup = toStoredTenantWorkItemLookup(stored);

    expect(repoLookup).toMatchObject({
      entityType: "TenantRepoLookup",
      repoId: "repo",
      repoLabel: "repo"
    });
    expect(repoLookup.partitionKey).toBe("TENANT_LOOKUP~dGVuYW50");
    expect(repoLookup.rowKey).toBe("REPO~cmVwbw");

    expect(itemLookup).toMatchObject({
      entityType: "TenantWorkItemLookup",
      repoId: "repo",
      workItemId: "ITEM~20260501153000~abc123",
      status: "Accepted",
      files: "[\"api/src/storage.ts\"]",
      tags: "[\"optimization\"]"
    });
    expect(itemLookup.partitionKey).toBe("TENANT_LOOKUP~dGVuYW50");
    expect(itemLookup.rowKey).toBe("ITEM~79739498846999~REPO~cmVwbw~ITEM~20260501153000~abc123");
    expect("tenantId" in itemLookup).toBe(false);
    expect(toWorkItem(stored)).toMatchObject({
      tenantId: "tenant",
      repoId: "repo",
      workItemId: "ITEM~20260501153000~abc123"
    });
  });

  it("restores the API work item shape from a tenant lookup row", () => {
    const stored = toStoredWorkItem(
      {
        tenantId: "tenant",
        repoId: "repo",
        workItemType: "Issue",
        category: "Bug",
        title: "Broken lookup",
        description: "Projection should map back.",
        severity: "High",
        status: "InProgress",
        source: "implementation",
        files: ["api/src/storage.ts"],
        tags: ["lookup"],
        createdBy: "codex",
        assignedTo: "maintainer"
      },
      "ITEM~20260501153000~abc123",
      "2026-05-01T15:30:00.000Z"
    );

    const lookup = toStoredTenantWorkItemLookup(stored);

    expect(toWorkItemFromTenantLookup(lookup, "tenant")).toMatchObject({
      tenantId: "tenant",
      repoId: "repo",
      workItemId: "ITEM~20260501153000~abc123",
      status: "InProgress",
      assignedTo: "maintainer",
      files: ["api/src/storage.ts"],
      tags: ["lookup"]
    });
  });

  it("maps users to the identity table key shape", () => {
    const user = {
      userKey: "github|123456",
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "{\"login\":\"octocat\"}",
      displayName: "Octo Cat",
      createdAtUtc: "2026-05-05T12:00:00.000Z",
      lastLoginAtUtc: "2026-05-05T12:00:00.000Z",
      loginCount: 1,
      isAdmin: false
    };

    const stored = toStoredUser(user);

    expect(stored.partitionKey).toBe("USER");
    expect(stored.rowKey).toBe("github|123456");
    expect(toUser(stored)).toEqual(user);
  });

  it("maps tenants to the tenant table key shape", () => {
    const tenant = {
      tenantId: "tenant-123",
      tenantType: "personal" as const,
      name: "Octo Cat",
      createdByUserKey: "github|123456",
      createdAtUtc: "2026-05-05T12:00:00.000Z"
    };

    const stored = toStoredTenant(tenant);

    expect(stored.partitionKey).toBe("TENANT");
    expect(stored.rowKey).toBe("tenant-123");
    expect(toTenant(stored)).toEqual(tenant);
  });

  it("maps tenant members to the tenant membership key shape", () => {
    const member = {
      tenantId: "tenant-123",
      userKey: "github|123456",
      role: "owner" as const,
      createdAtUtc: "2026-05-05T12:00:00.000Z"
    };

    const stored = toStoredTenantMember(member);

    expect(tenantMemberPartitionKey("tenant-123")).toBe("TENANT~tenant-123");
    expect(tenantMemberRowKey("github|123456")).toBe("USER~github|123456");
    expect(stored.partitionKey).toBe("TENANT~tenant-123");
    expect(stored.rowKey).toBe("USER~github|123456");
    expect(toTenantMember(stored)).toEqual(member);
  });

  it("maps personal API keys to the API key table shape without exposing hashes in metadata", () => {
    const apiKey = {
      apiKeyId: "key_123",
      tenantId: "tenant-123",
      userKey: "github|123456",
      name: "Codex CLI",
      keyPrefix: "abc123def456",
      keyHash: "a".repeat(64),
      scopes: ["workitems:read", "workitems:update"] as const,
      createdAtUtc: "2026-05-05T12:00:00.000Z",
      expiresAtUtc: "",
      lastUsedAtUtc: "",
      revokedAtUtc: ""
    };

    const stored = toStoredApiKey(apiKey);

    expect(apiKeyPartitionKey("tenant-123", "github|123456")).toBe("TENANT~tenant-123~USER~github|123456");
    expect(apiKeyRowKey("key_123")).toBe("APIKEY~key_123");
    expect(stored.partitionKey).toBe("TENANT~tenant-123~USER~github|123456");
    expect(stored.rowKey).toBe("APIKEY~key_123");
    expect(stored.scopes).toBe("[\"workitems:read\",\"workitems:update\"]");
    expect(toApiKey(stored)).toEqual(apiKey);
    expect(toApiKeyMetadata(apiKey)).toEqual({
      apiKeyId: "key_123",
      tenantId: "tenant-123",
      userKey: "github|123456",
      name: "Codex CLI",
      keyPrefix: "abc123def456",
      scopes: ["workitems:read", "workitems:update"],
      createdAtUtc: "2026-05-05T12:00:00.000Z",
      expiresAtUtc: "",
      lastUsedAtUtc: "",
      revokedAtUtc: ""
    });
  });
});
