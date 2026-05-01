import { odata, TableClient } from "@azure/data-tables";
import { TraceOpsConfig } from "./config.js";
import {
  CreateWorkItemInput,
  partitionKey,
  UpdateLinksInput,
  WorkItem,
  WorkItemEvent
} from "./domain.js";

type StoredWorkItem = Omit<WorkItem, "files" | "tags"> & {
  partitionKey: string;
  rowKey: string;
  files: string;
  tags: string;
};

type StoredWorkItemEvent = WorkItemEvent & {
  partitionKey: string;
  rowKey: string;
};

export type StoredWorkItemResult = StoredWorkItem & {
  etag?: string;
};

function safeParseStringArray(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function toWorkItem(entity: StoredWorkItemResult): WorkItem {
  return {
    tenantId: entity.tenantId,
    repoId: entity.repoId,
    workItemId: entity.workItemId,
    workItemType: entity.workItemType,
    category: entity.category,
    title: entity.title,
    description: entity.description,
    severity: entity.severity,
    status: entity.status,
    source: entity.source,
    files: safeParseStringArray(entity.files),
    tags: safeParseStringArray(entity.tags),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
    createdBy: entity.createdBy,
    assignedTo: entity.assignedTo,
    claimedBy: entity.claimedBy,
    claimedAt: entity.claimedAt,
    claimExpiresAt: entity.claimExpiresAt,
    externalBranchName: entity.externalBranchName,
    externalCommitUrl: entity.externalCommitUrl,
    externalPrUrl: entity.externalPrUrl
  };
}

export function toStoredWorkItem(input: CreateWorkItemInput, workItemId: string, now: string): StoredWorkItem {
  return {
    partitionKey: partitionKey(input.tenantId, input.repoId),
    rowKey: workItemId,
    tenantId: input.tenantId,
    repoId: input.repoId,
    workItemId,
    workItemType: input.workItemType,
    category: input.category,
    title: input.title,
    description: input.description,
    severity: input.severity,
    status: input.status || "New",
    source: input.source,
    files: JSON.stringify(input.files || []),
    tags: JSON.stringify(input.tags || []),
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    assignedTo: input.assignedTo || "",
    claimedBy: "",
    claimedAt: "",
    claimExpiresAt: "",
    externalBranchName: input.externalBranchName || "",
    externalCommitUrl: input.externalCommitUrl || "",
    externalPrUrl: input.externalPrUrl || ""
  };
}

export function toStoredEvent(event: WorkItemEvent): StoredWorkItemEvent {
  return {
    partitionKey: partitionKey(event.tenantId, event.repoId),
    rowKey: event.eventId,
    ...event
  };
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}

function isPreconditionFailed(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 412;
}

export class WorkItemConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkItemConflictError";
  }
}

export class WorkItemNotFoundError extends Error {
  constructor(workItemId: string) {
    super(`Work item not found: ${workItemId}`);
    this.name = "WorkItemNotFoundError";
  }
}

export class WorkItemRepository {
  private readonly workItemsClient: TableClient;
  private readonly eventsClient: TableClient;

  constructor(config: TraceOpsConfig) {
    this.workItemsClient = TableClient.fromConnectionString(
      config.storageConnectionString,
      config.workItemsTableName
    );
    this.eventsClient = TableClient.fromConnectionString(
      config.storageConnectionString,
      config.workItemEventsTableName
    );
  }

  async createWorkItem(entity: StoredWorkItem): Promise<WorkItem> {
    await this.workItemsClient.createEntity(entity);
    return toWorkItem(entity);
  }

  async getWorkItem(tenantId: string, repoId: string, workItemId: string): Promise<StoredWorkItemResult> {
    try {
      return await this.workItemsClient.getEntity<StoredWorkItemResult>(
        partitionKey(tenantId, repoId),
        workItemId
      );
    } catch (error) {
      if (isNotFound(error)) {
        throw new WorkItemNotFoundError(workItemId);
      }

      throw error;
    }
  }

  async listWorkItems(tenantId: string, repoId: string, limit: number): Promise<StoredWorkItemResult[]> {
    const items: StoredWorkItemResult[] = [];
    const filter = odata`PartitionKey eq ${partitionKey(tenantId, repoId)}`;

    for await (const entity of this.workItemsClient.listEntities<StoredWorkItemResult>({
      queryOptions: { filter }
    })) {
      items.push(entity);

      if (items.length >= limit) {
        break;
      }
    }

    return items;
  }

  async replaceWorkItem(entity: StoredWorkItemResult): Promise<WorkItem> {
    try {
      await this.workItemsClient.updateEntity(entity, "Replace", { etag: entity.etag });
      return toWorkItem(entity);
    } catch (error) {
      if (isPreconditionFailed(error)) {
        throw new WorkItemConflictError("Work item was modified by another writer");
      }

      throw error;
    }
  }

  async createEvent(event: WorkItemEvent): Promise<void> {
    await this.eventsClient.createEntity(toStoredEvent(event));
  }
}

export function applyLinks(workItem: StoredWorkItemResult, links: UpdateLinksInput, now: string): StoredWorkItemResult {
  return {
    ...workItem,
    externalBranchName: links.externalBranchName ?? workItem.externalBranchName,
    externalCommitUrl: links.externalCommitUrl ?? workItem.externalCommitUrl,
    externalPrUrl: links.externalPrUrl ?? workItem.externalPrUrl,
    updatedAt: now
  };
}
