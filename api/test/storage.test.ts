import { describe, expect, it } from "vitest";
import { partitionKey } from "../src/domain.js";
import {
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
