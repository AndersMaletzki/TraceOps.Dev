import { odata, TableClient } from "@azure/data-tables";
import { TraceOpsConfig } from "./config.js";
import {
  apiKeyScopes,
  ApiKeyMetadata,
  CreateWorkItemInput,
  partitionKey,
  TraceOpsApiKey,
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

type StoredTraceOpsApiKey = Omit<TraceOpsApiKey, "scopes"> & {
  partitionKey: string;
  rowKey: string;
  scopes: string;
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

type StoredTraceOpsApiKeyResult = Partial<StoredTraceOpsApiKey> &
  Pick<
    StoredTraceOpsApiKey,
    | "partitionKey"
    | "rowKey"
    | "apiKeyId"
    | "tenantId"
    | "userKey"
    | "name"
    | "keyPrefix"
    | "keyHash"
    | "scopes"
    | "createdAtUtc"
    | "expiresAtUtc"
    | "lastUsedAtUtc"
    | "revokedAtUtc"
  > & {
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

function parseApiKeyScopes(value: string | undefined) {
  return safeParseStringArray(value).filter((scope): scope is (typeof apiKeyScopes)[number] =>
    apiKeyScopes.includes(scope as (typeof apiKeyScopes)[number])
  );
}

export function apiKeyPartitionKey(tenantId: string, userKey: string): string {
  return `TENANT~${tenantId}~USER~${userKey}`;
}

export function apiKeyRowKey(apiKeyId: string): string {
  return `APIKEY~${apiKeyId}`;
}

export function toStoredApiKey(apiKey: TraceOpsApiKey): StoredTraceOpsApiKey {
  return {
    partitionKey: apiKeyPartitionKey(apiKey.tenantId, apiKey.userKey),
    rowKey: apiKeyRowKey(apiKey.apiKeyId),
    ...apiKey,
    scopes: JSON.stringify(apiKey.scopes)
  };
}

export function toApiKey(entity: StoredTraceOpsApiKeyResult): TraceOpsApiKey {
  return {
    apiKeyId: entity.apiKeyId,
    tenantId: entity.tenantId,
    userKey: entity.userKey,
    name: entity.name,
    keyPrefix: entity.keyPrefix,
    keyHash: entity.keyHash,
    scopes: parseApiKeyScopes(entity.scopes),
    createdAtUtc: entity.createdAtUtc,
    expiresAtUtc: entity.expiresAtUtc || "",
    lastUsedAtUtc: entity.lastUsedAtUtc || "",
    revokedAtUtc: entity.revokedAtUtc || ""
  };
}

export function toApiKeyMetadata(apiKey: TraceOpsApiKey): ApiKeyMetadata {
  const { keyHash: _keyHash, ...metadata } = apiKey;
  return metadata;
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

export class ApiKeyNotFoundError extends Error {
  constructor(apiKeyId: string) {
    super(`API key not found: ${apiKeyId}`);
    this.name = "ApiKeyNotFoundError";
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

  async listWorkItemsForTenant(tenantId: string, limit: number): Promise<StoredWorkItemResult[]> {
    const items: StoredWorkItemResult[] = [];
    const filter = odata`tenantId eq ${tenantId}`;

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

  async listAllWorkItems(limit: number): Promise<StoredWorkItemResult[]> {
    const items: StoredWorkItemResult[] = [];

    for await (const entity of this.workItemsClient.listEntities<StoredWorkItemResult>()) {
      items.push(entity);

      if (items.length >= limit) {
        break;
      }
    }

    return items;
  }

  async listRepositoryIdsForTenant(tenantId: string, limit = 250): Promise<string[]> {
    const repoIds = new Set<string>();
    const filter = odata`tenantId eq ${tenantId}`;

    for await (const entity of this.workItemsClient.listEntities<StoredWorkItemResult>({
      queryOptions: { filter, select: ["repoId"] }
    })) {
      if (entity.repoId) {
        repoIds.add(entity.repoId);
      }

      if (repoIds.size >= limit) {
        break;
      }
    }

    return [...repoIds].sort((left, right) => left.localeCompare(right));
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

  async listUsers(limit = 10000): Promise<TraceOpsUser[]> {
    const users: TraceOpsUser[] = [];
    const filter = odata`PartitionKey eq ${"USER"}`;

    for await (const entity of this.usersClient.listEntities<StoredTraceOpsUserResult>({
      queryOptions: { filter }
    })) {
      users.push(toUser(entity));

      if (users.length >= limit) {
        break;
      }
    }

    return users;
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

export class ApiKeyRepository {
  private readonly apiKeysClient: TableClient;

  constructor(config: TraceOpsConfig) {
    this.apiKeysClient = TableClient.fromConnectionString(
      config.storageConnectionString,
      config.apiKeysTableName
    );
  }

  async createApiKey(apiKey: TraceOpsApiKey): Promise<TraceOpsApiKey> {
    const entity = toStoredApiKey(apiKey);
    await this.apiKeysClient.createEntity(entity);
    return toApiKey(entity);
  }

  async getApiKey(tenantId: string, userKey: string, apiKeyId: string): Promise<TraceOpsApiKey> {
    try {
      const entity = await this.apiKeysClient.getEntity<StoredTraceOpsApiKeyResult>(
        apiKeyPartitionKey(tenantId, userKey),
        apiKeyRowKey(apiKeyId)
      );
      return toApiKey(entity);
    } catch (error) {
      if (isNotFound(error)) {
        throw new ApiKeyNotFoundError(apiKeyId);
      }

      throw error;
    }
  }

  async listApiKeysForUser(tenantId: string, userKey: string, limit = 100): Promise<TraceOpsApiKey[]> {
    const items: TraceOpsApiKey[] = [];
    const filter = odata`PartitionKey eq ${apiKeyPartitionKey(tenantId, userKey)}`;

    for await (const entity of this.apiKeysClient.listEntities<StoredTraceOpsApiKeyResult>({
      queryOptions: { filter }
    })) {
      items.push(toApiKey(entity));

      if (items.length >= limit) {
        break;
      }
    }

    return items.sort((left, right) => right.createdAtUtc.localeCompare(left.createdAtUtc));
  }

  async findApiKeysByPrefix(keyPrefix: string, limit = 20): Promise<TraceOpsApiKey[]> {
    const items: TraceOpsApiKey[] = [];
    const filter = odata`keyPrefix eq ${keyPrefix}`;

    for await (const entity of this.apiKeysClient.listEntities<StoredTraceOpsApiKeyResult>({
      queryOptions: { filter }
    })) {
      items.push(toApiKey(entity));

      if (items.length >= limit) {
        break;
      }
    }

    return items;
  }

  async upsertApiKey(apiKey: TraceOpsApiKey): Promise<TraceOpsApiKey> {
    const entity = toStoredApiKey(apiKey);
    await this.apiKeysClient.upsertEntity(entity, "Replace");
    return toApiKey(entity);
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
