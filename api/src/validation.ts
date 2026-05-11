import {
  apiKeyScopes,
  ApiKeyScope,
  CreateWorkItemInput,
  SyncUserInput,
  workItemCategories,
  WorkItemCategory,
  workItemSeverities,
  WorkItemSeverity,
  workItemStatuses,
  WorkItemStatus,
  workItemTypes,
  WorkItemType
} from "./domain.js";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  return value;
}

export function requiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required`);
  }

  return value.trim();
}

export function optionalString(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  return value.trim();
}

export function optionalStringArray(value: unknown, fieldName: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new ValidationError(`${fieldName} must be an array of strings`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

export function requiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new ValidationError(`${fieldName} must be an array of strings`);
  }

  return value.map((item) => item.trim()).filter(Boolean);
}

function requiredTableKeySegment(value: unknown, fieldName: string): string {
  const segment = requiredString(value, fieldName);

  if (/[\\/#?\u0000-\u001F\u007F-\u009F]/.test(segment)) {
    throw new ValidationError(`${fieldName} contains characters that are not allowed in storage keys`);
  }

  return segment;
}

export function parseLimit(value: unknown, defaultLimit = 10, maxLimit = 50): number {
  if (value === undefined || value === null || value === "") {
    return defaultLimit;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError("limit must be a positive integer");
  }

  return Math.min(parsed, maxLimit);
}

function parseEnum<T extends string>(value: unknown, values: readonly T[], fieldName: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new ValidationError(`${fieldName} must be one of: ${values.join(", ")}`);
  }

  return value as T;
}

export function parseOptionalEnum<T extends string>(
  value: unknown,
  values: readonly T[],
  fieldName: string
): T | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  return parseEnum(value, values, fieldName);
}

export function parseWorkItemType(value: unknown): WorkItemType {
  return parseEnum(value, workItemTypes, "workItemType");
}

export function parseCategory(value: unknown): WorkItemCategory {
  return parseEnum(value, workItemCategories, "category");
}

export function parseSeverity(value: unknown): WorkItemSeverity {
  return parseEnum(value, workItemSeverities, "severity");
}

export function parseStatus(value: unknown): WorkItemStatus {
  return parseEnum(value, workItemStatuses, "status");
}

export function parseCreateWorkItemInput(value: unknown): CreateWorkItemInput {
  const body = requireRecord(value);

  return {
    tenantId: requiredString(body.tenantId, "tenantId"),
    repoId: requiredString(body.repoId, "repoId"),
    workItemType: parseWorkItemType(body.workItemType),
    category: parseCategory(body.category),
    title: requiredString(body.title, "title"),
    description: requiredString(body.description, "description"),
    severity: parseSeverity(body.severity),
    status: parseOptionalEnum(body.status, workItemStatuses, "status"),
    source: requiredString(body.source, "source"),
    files: optionalStringArray(body.files, "files"),
    tags: optionalStringArray(body.tags, "tags"),
    createdBy: requiredString(body.createdBy, "createdBy"),
    createdByUserKey: optionalString(body.createdByUserKey, "createdByUserKey"),
    assignedTo: optionalString(body.assignedTo, "assignedTo"),
    assignedToUserKey: optionalString(body.assignedToUserKey, "assignedToUserKey"),
    externalBranchName: optionalString(body.externalBranchName, "externalBranchName"),
    externalCommitUrl: optionalString(body.externalCommitUrl, "externalCommitUrl"),
    externalPrUrl: optionalString(body.externalPrUrl, "externalPrUrl")
  };
}

export function parseSyncUserInput(value: unknown): SyncUserInput {
  const body = requireRecord(value);

  return {
    identityProvider: requiredTableKeySegment(body.identityProvider, "identityProvider"),
    providerUserId: requiredTableKeySegment(body.providerUserId, "providerUserId"),
    userDetails: requiredString(body.userDetails, "userDetails"),
    displayName: optionalString(body.displayName, "displayName"),
    roles: requiredStringArray(body.roles, "roles").map((role) => role.toLowerCase())
  };
}

function optionalUtcTimestamp(value: unknown, fieldName: string): string | undefined {
  const timestamp = optionalString(value, fieldName);

  if (!timestamp) {
    return undefined;
  }

  if (!Number.isFinite(Date.parse(timestamp))) {
    throw new ValidationError(`${fieldName} must be a valid ISO-8601 timestamp`);
  }

  return timestamp;
}

export function parseApiKeyScopes(value: unknown): ApiKeyScope[] {
  if (value === undefined || value === null) {
    return [...apiKeyScopes];
  }

  const scopes = requiredStringArray(value, "scopes");
  const uniqueScopes = [...new Set(scopes)];

  if (!uniqueScopes.every((scope) => apiKeyScopes.includes(scope as ApiKeyScope))) {
    throw new ValidationError(`scopes must be one of: ${apiKeyScopes.join(", ")}`);
  }

  return uniqueScopes as ApiKeyScope[];
}

export function parseCreateApiKeyInput(value: unknown): {
  name: string;
  scopes: ApiKeyScope[];
  expiresAtUtc?: string;
} {
  const body = requireRecord(value);

  return {
    name: requiredString(body.name, "name"),
    scopes: parseApiKeyScopes(body.scopes),
    expiresAtUtc: optionalUtcTimestamp(body.expiresAtUtc, "expiresAtUtc")
  };
}
