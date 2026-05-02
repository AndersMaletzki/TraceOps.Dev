import { randomUUID } from "node:crypto";
import {
  ClaimWorkItemInput,
  CreateWorkItemInput,
  severityRank,
  UpdateLinksInput,
  UpdateStatusInput,
  WorkItem,
  WorkItemEvent,
  WorkItemFilters
} from "./domain.js";
import {
  applyLinks,
  StoredWorkItemResult,
  toStoredWorkItem,
  toWorkItem,
  WorkItemConflictError,
  WorkItemRepository
} from "./storage.js";

export { WorkItemConflictError, WorkItemNotFoundError } from "./storage.js";

function sortableTimestamp(date = new Date()): string {
  return date.toISOString().replace(/\D/g, "").slice(0, 14);
}

function isoNow(date = new Date()): string {
  return date.toISOString();
}

function newShortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 10);
}

export function newWorkItemId(date = new Date()): string {
  return `ITEM~${sortableTimestamp(date)}~${newShortId()}`;
}

export function newEventId(date = new Date()): string {
  return `EVT~${sortableTimestamp(date)}~${newShortId()}`;
}

export function matchesFilters(workItem: WorkItem, filters: Omit<WorkItemFilters, "tenantId" | "repoId" | "limit">): boolean {
  return (
    (!filters.status || workItem.status === filters.status) &&
    (!filters.severity || workItem.severity === filters.severity) &&
    (!filters.workItemType || workItem.workItemType === filters.workItemType) &&
    (!filters.category || workItem.category === filters.category)
  );
}

export function chooseNextWorkItem(items: WorkItem[]): WorkItem | undefined {
  return [...items].sort((left, right) => {
    const severityDifference = severityRank[left.severity] - severityRank[right.severity];
    if (severityDifference !== 0) {
      return severityDifference;
    }

    return left.createdAt.localeCompare(right.createdAt);
  })[0];
}

export function buildStatusChangedEvent(
  workItem: WorkItem,
  previousStatus: WorkItem["status"],
  actor: string,
  now: string,
  eventId: string
): WorkItemEvent {
  return {
    tenantId: workItem.tenantId,
    repoId: workItem.repoId,
    workItemId: workItem.workItemId,
    eventId,
    eventType: "StatusChanged",
    previousStatus,
    newStatus: workItem.status,
    actor,
    createdAt: now
  };
}

export class WorkItemService {
  constructor(private readonly repository: WorkItemRepository) {}

  async create(input: CreateWorkItemInput): Promise<WorkItem> {
    const now = isoNow();
    return this.repository.createWorkItem(toStoredWorkItem(input, newWorkItemId(), now));
  }

  async list(filters: WorkItemFilters): Promise<WorkItem[]> {
    const entities = await this.repository.listWorkItems(filters.tenantId, filters.repoId, 250);
    return entities
      .map(toWorkItem)
      .filter((workItem) => matchesFilters(workItem, filters))
      .slice(0, filters.limit);
  }

  async get(tenantId: string, repoId: string, workItemId: string): Promise<WorkItem> {
    return toWorkItem(await this.repository.getWorkItem(tenantId, repoId, workItemId));
  }

  async getNext(filters: WorkItemFilters): Promise<WorkItem | undefined> {
    const candidateStatuses = filters.status ? [filters.status] : ["New", "Accepted"];
    const items = await this.list({ ...filters, status: undefined, limit: 50 });

    return chooseNextWorkItem(
      items.filter((workItem) => candidateStatuses.includes(workItem.status))
    );
  }

  async updateStatus(workItemId: string, input: UpdateStatusInput): Promise<WorkItem> {
    const entity = await this.repository.getWorkItem(input.tenantId, input.repoId, workItemId);
    const previousStatus = entity.status;
    const now = isoNow();
    const updatedEntity: StoredWorkItemResult = {
      ...entity,
      status: input.status,
      updatedAt: now
    };
    const updatedWorkItem = await this.repository.replaceWorkItem(updatedEntity);

    await this.repository.createEvent(
      buildStatusChangedEvent(updatedWorkItem, previousStatus, input.actor, now, newEventId())
    );

    return updatedWorkItem;
  }

  async claim(workItemId: string, input: ClaimWorkItemInput): Promise<WorkItem> {
    const entity = await this.repository.getWorkItem(input.tenantId, input.repoId, workItemId);
    const nowDate = new Date();
    const now = isoNow(nowDate);
    const existingClaimExpiresAt = entity.claimExpiresAt ? Date.parse(entity.claimExpiresAt) : 0;
    const activeClaimExists =
      entity.claimedBy &&
      entity.claimedBy !== input.claimedBy &&
      Number.isFinite(existingClaimExpiresAt) &&
      existingClaimExpiresAt > nowDate.getTime();

    if (activeClaimExists) {
      throw new WorkItemConflictError("Work item is already claimed");
    }

    const durationMinutes = input.claimDurationMinutes || 60;
    const claimExpiresAt = new Date(nowDate.getTime() + durationMinutes * 60_000).toISOString();

    return this.repository.replaceWorkItem({
      ...entity,
      claimedBy: input.claimedBy,
      claimedAt: now,
      claimExpiresAt,
      updatedAt: now
    });
  }

  async updateLinks(workItemId: string, input: UpdateLinksInput): Promise<WorkItem> {
    const entity = await this.repository.getWorkItem(input.tenantId, input.repoId, workItemId);
    return this.repository.replaceWorkItem(applyLinks(entity, input, isoNow()));
  }
}
