import { odata, TableClient } from "@azure/data-tables";
import { TraceOpsConfig } from "./config.js";
import {
  CreateWorkItemInput,
  partitionKey,
  TraceOpsTenant,
  TraceOpsTenantMember,
  TraceOpsUser,
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

type StoredTraceOpsUser = TraceOpsUser & {
  partitionKey: "USER";
  rowKey: string;
};

type StoredTraceOpsTenant = TraceOpsTenant & {
  partitionKey: "TENANT";
  rowKey: string;
};

type StoredTraceOpsTenantMember = TraceOpsTenantMember & {
  partitionKey: string;
  rowKey: string;
};

type StoredTraceOpsUserResult = Partial<StoredTraceOpsUser> &
  Pick<
    StoredTraceOpsUser,
    | "partitionKey"
    | "rowKey"
    | "userKey"
    | "identityProvider"
    | "providerUserId"
    | "userDetails"
    | "displayName"
    | "createdAtUtc"
    | "lastLoginAtUtc"
    | "loginCount"
    | "isAdmin"
  > & {
  etag?: string;
};

type StoredTraceOpsTenantResult = Partial<StoredTraceOpsTenant> &
  Pick<
    StoredTraceOpsTenant,
    "partitionKey" | "rowKey" | "tenantId" | "tenantType" | "name" | "createdByUserKey" | "createdAtUtc"
  > & {
  etag?: string;
};

type StoredTraceOpsTenantMemberResult = Partial<StoredTraceOpsTenantMember> &
  Pick<StoredTraceOpsTenantMember, "partitionKey" | "rowKey" | "tenantId" | "userKey" | "role" | "createdAtUtc"> & {
  etag?: string;
};

export type StoredWorkItemResult = Partial<StoredWorkItem> &
  Pick<
    StoredWorkItem,
    | "partitionKey"
    | "rowKey"
    | "tenantId"
    | "repoId"
    | "workItemId"
    | "workItemType"
    | "category"
    | "title"
    | "description"
    | "severity"
    | "status"
    | "source"
    | "files"
    | "tags"
    | "createdAt"
    | "updatedAt"
    | "createdBy"
  > & {
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
    createdByUserKey: entity.createdByUserKey || "",
    assignedTo: entity.assignedTo || "",
    assignedToUserKey: entity.assignedToUserKey || "",
    claimedBy: entity.claimedBy || "",
    claimedAt: entity.claimedAt || "",
    claimExpiresAt: entity.claimExpiresAt || "",
    externalBranchName: entity.externalBranchName || "",
    externalCommitUrl: entity.externalCommitUrl || "",
    externalPrUrl: entity.externalPrUrl || ""
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
    createdByUserKey: input.createdByUserKey || "",
    assignedTo: input.assignedTo || "",
    assignedToUserKey: input.assignedToUserKey || "",
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

export function tenantMemberPartitionKey(tenantId: string): string {
  return `TENANT~${tenantId}`;
}

export function tenantMemberRowKey(userKey: string): string {
  return `USER~${userKey}`;
}

export function toStoredUser(user: TraceOpsUser): StoredTraceOpsUser {
  return {
    partitionKey: "USER",
    rowKey: user.userKey,
    ...user
  };
}

export function toUser(entity: StoredTraceOpsUserResult): TraceOpsUser {
  return {
    userKey: entity.userKey,
    identityProvider: entity.identityProvider,
    providerUserId: entity.providerUserId,
    userDetails: entity.userDetails,
    displayName: entity.displayName,
    createdAtUtc: entity.createdAtUtc,
    lastLoginAtUtc: entity.lastLoginAtUtc,
    loginCount: entity.loginCount,
    isAdmin: entity.isAdmin
  };
}

export function toStoredTenant(tenant: TraceOpsTenant): StoredTraceOpsTenant {
  return {
    partitionKey: "TENANT",
    rowKey: tenant.tenantId,
    ...tenant
  };
}

export function toTenant(entity: StoredTraceOpsTenantResult): TraceOpsTenant {
  return {
    tenantId: entity.tenantId,
    tenantType: entity.tenantType,
    name: entity.name,
    createdByUserKey: entity.createdByUserKey,
    createdAtUtc: entity.createdAtUtc
  };
}

export function toStoredTenantMember(member: TraceOpsTenantMember): StoredTraceOpsTenantMember {
  return {
    partitionKey: tenantMemberPartitionKey(member.tenantId),
    rowKey: tenantMemberRowKey(member.userKey),
    ...member
  };
}

export function toTenantMember(entity: StoredTraceOpsTenantMemberResult): TraceOpsTenantMember {
  return {
    tenantId: entity.tenantId,
    userKey: entity.userKey,
    role: entity.role,
    createdAtUtc: entity.createdAtUtc
  };
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}

export function isStorageNotFound(error: unknown): boolean {
  return isNotFound(error);
}

export function isStorageConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 409;
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

export class UserRepository {
  private readonly usersClient: TableClient;

  constructor(config: TraceOpsConfig) {
    this.usersClient = TableClient.fromConnectionString(
      config.storageConnectionString,
      config.usersTableName
    );
  }

  async createUser(user: TraceOpsUser): Promise<TraceOpsUser> {
    const entity = toStoredUser(user);
    await this.usersClient.createEntity(entity);
    return toUser(entity);
  }

  async getUser(userKey: string): Promise<TraceOpsUser> {
    const entity = await this.usersClient.getEntity<StoredTraceOpsUserResult>("USER", userKey);
    return toUser(entity);
  }

  async upsertUser(user: TraceOpsUser): Promise<TraceOpsUser> {
    const entity = toStoredUser(user);
    await this.usersClient.upsertEntity(entity, "Replace");
    return toUser(entity);
  }
}

export class TenantRepository {
  private readonly tenantsClient: TableClient;

  constructor(config: TraceOpsConfig) {
    this.tenantsClient = TableClient.fromConnectionString(
      config.storageConnectionString,
      config.tenantsTableName
    );
  }

  async createTenant(tenant: TraceOpsTenant): Promise<TraceOpsTenant> {
    const entity = toStoredTenant(tenant);
    await this.tenantsClient.createEntity(entity);
    return toTenant(entity);
  }

  async getTenant(tenantId: string): Promise<TraceOpsTenant> {
    const entity = await this.tenantsClient.getEntity<StoredTraceOpsTenantResult>("TENANT", tenantId);
    return toTenant(entity);
  }
}

export class TenantMemberRepository {
  private readonly tenantMembersClient: TableClient;

  constructor(config: TraceOpsConfig) {
    this.tenantMembersClient = TableClient.fromConnectionString(
      config.storageConnectionString,
      config.tenantMembersTableName
    );
  }

  async createTenantMember(member: TraceOpsTenantMember): Promise<TraceOpsTenantMember> {
    const entity = toStoredTenantMember(member);
    await this.tenantMembersClient.createEntity(entity);
    return toTenantMember(entity);
  }

  async getTenantMember(tenantId: string, userKey: string): Promise<TraceOpsTenantMember> {
    const entity = await this.tenantMembersClient.getEntity<StoredTraceOpsTenantMemberResult>(
      tenantMemberPartitionKey(tenantId),
      tenantMemberRowKey(userKey)
    );
    return toTenantMember(entity);
  }

  async listTenantMembers(tenantId: string, limit = 100): Promise<TraceOpsTenantMember[]> {
    const members: TraceOpsTenantMember[] = [];
    const filter = odata`PartitionKey eq ${tenantMemberPartitionKey(tenantId)}`;

    for await (const entity of this.tenantMembersClient.listEntities<StoredTraceOpsTenantMemberResult>({
      queryOptions: { filter }
    })) {
      members.push(toTenantMember(entity));

      if (members.length >= limit) {
        break;
      }
    }

    return members;
  }

  async listTenantMembershipsForUser(userKey: string, limit = 100): Promise<TraceOpsTenantMember[]> {
    const members: TraceOpsTenantMember[] = [];
    const filter = odata`RowKey eq ${tenantMemberRowKey(userKey)}`;

    for await (const entity of this.tenantMembersClient.listEntities<StoredTraceOpsTenantMemberResult>({
      queryOptions: { filter }
    })) {
      members.push(toTenantMember(entity));

      if (members.length >= limit) {
        break;
      }
    }

    return members;
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
