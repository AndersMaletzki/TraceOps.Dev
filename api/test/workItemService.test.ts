import { describe, expect, it, vi } from "vitest";
import { CreateWorkItemInput } from "../src/domain.js";
import { StoredWorkItemResult, toStoredWorkItem, toWorkItem, WorkItemConflictError, WorkItemRepository } from "../src/storage.js";
import { WorkItemService } from "../src/workItemService.js";

const createInput: CreateWorkItemInput = {
  tenantId: "tenant",
  repoId: "repo",
  workItemType: "Issue",
  category: "Bug",
  title: "Broken API",
  description: "The API returns a bad response.",
  severity: "High",
  status: "New",
  source: "audit",
  files: [],
  tags: [],
  createdBy: "codex"
};

function createStored(overrides: Partial<StoredWorkItemResult> = {}): StoredWorkItemResult {
  return {
    ...toStoredWorkItem(createInput, "ITEM#20260501153000#abc123", "2026-05-01T15:30:00.000Z"),
    etag: "etag",
    ...overrides
  };
}

describe("WorkItemService", () => {
  it("writes an append-only event when status changes", async () => {
    const stored = createStored();
    const createEvent = vi.fn(async () => undefined);
    const repository = {
      getWorkItem: vi.fn(async () => stored),
      replaceWorkItem: vi.fn(async (entity: StoredWorkItemResult) => toWorkItem(entity)),
      createEvent
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);
    const updated = await service.updateStatus("ITEM#20260501153000#abc123", {
      tenantId: "tenant",
      repoId: "repo",
      status: "InProgress",
      actor: "codex"
    });

    expect(updated.status).toBe("InProgress");
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        workItemId: "ITEM#20260501153000#abc123",
        previousStatus: "New",
        newStatus: "InProgress",
        actor: "codex"
      })
    );
  });

  it("rejects a claim when another active claim exists", async () => {
    const stored = createStored({
      claimedBy: "other-agent",
      claimExpiresAt: new Date(Date.now() + 60_000).toISOString()
    });
    const repository = {
      getWorkItem: vi.fn(async () => stored),
      replaceWorkItem: vi.fn()
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);

    await expect(
      service.claim("ITEM#20260501153000#abc123", {
        tenantId: "tenant",
        repoId: "repo",
        claimedBy: "codex"
      })
    ).rejects.toThrow(WorkItemConflictError);
  });

  it("allows replacing an expired claim", async () => {
    const stored = createStored({
      claimedBy: "other-agent",
      claimExpiresAt: new Date(Date.now() - 60_000).toISOString()
    });
    const repository = {
      getWorkItem: vi.fn(async () => stored),
      replaceWorkItem: vi.fn(async (entity: StoredWorkItemResult) => toWorkItem(entity))
    } as unknown as WorkItemRepository;

    const service = new WorkItemService(repository);
    const updated = await service.claim("ITEM#20260501153000#abc123", {
      tenantId: "tenant",
      repoId: "repo",
      claimedBy: "codex"
    });

    expect(updated.claimedBy).toBe("codex");
    expect(new Date(updated.claimExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
