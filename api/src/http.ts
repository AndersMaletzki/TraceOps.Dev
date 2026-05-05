import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { apiKeysMatch } from "./apiKey.js";
import { TenantAccessDeniedError } from "./authService.js";
import { TraceOpsConfig } from "./config.js";
import {
  parseCategory,
  parseLimit,
  parseOptionalEnum,
  parseSeverity,
  parseStatus,
  parseWorkItemType,
  requireRecord,
  requiredString,
  ValidationError
} from "./validation.js";
import {
  workItemCategories,
  workItemSeverities,
  workItemStatuses,
  workItemTypes,
  WorkItemFilters
} from "./domain.js";
import { WorkItemConflictError, WorkItemNotFoundError } from "./workItemService.js";

export function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body
  };
}

export function authenticate(request: HttpRequest, config: TraceOpsConfig): HttpResponseInit | undefined {
  const suppliedApiKey = request.headers.get("x-api-key");

  if (!suppliedApiKey || !apiKeysMatch(suppliedApiKey, config.apiKey)) {
    return json(401, { error: "Unauthorized" });
  }

  return undefined;
}

export async function readJson(request: HttpRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export function parseFiltersFromQuery(request: HttpRequest): WorkItemFilters {
  return {
    tenantId: requiredString(request.query.get("tenantId"), "tenantId"),
    repoId: requiredString(request.query.get("repoId"), "repoId"),
    callerUserKey: parseCallerUserKey(request),
    status: parseOptionalEnum(request.query.get("status"), workItemStatuses, "status"),
    severity: parseOptionalEnum(request.query.get("severity"), workItemSeverities, "severity"),
    workItemType: parseOptionalEnum(request.query.get("workItemType"), workItemTypes, "workItemType"),
    category: parseOptionalEnum(request.query.get("category"), workItemCategories, "category"),
    limit: parseLimit(request.query.get("limit"))
  };
}

export function parseCallerUserKey(request: HttpRequest): string | undefined {
  const value =
    request.headers.get("x-traceops-user-key") ||
    request.headers.get("x-user-key") ||
    request.query.get("callerUserKey");
  const trimmed = value?.trim();

  return trimmed || undefined;
}

type AppWorkItemFilters = Omit<WorkItemFilters, "tenantId" | "callerUserKey"> & {
  tenantId?: string;
  callerUserKey: string;
};

export function parseAppWorkItemFiltersFromQuery(request: HttpRequest): AppWorkItemFilters {
  return {
    tenantId: request.query.get("tenantId")?.trim() || undefined,
    repoId: requiredString(request.query.get("repoId"), "repoId"),
    callerUserKey: requiredString(parseCallerUserKey(request), "callerUserKey"),
    status: parseOptionalEnum(request.query.get("status"), workItemStatuses, "status"),
    severity: parseOptionalEnum(request.query.get("severity"), workItemSeverities, "severity"),
    workItemType: parseOptionalEnum(request.query.get("workItemType"), workItemTypes, "workItemType"),
    category: parseOptionalEnum(request.query.get("category"), workItemCategories, "category"),
    limit: parseLimit(request.query.get("limit"))
  };
}

export function parseTenantRepoBody(value: unknown): { tenantId: string; repoId: string } {
  const body = requireRecord(value);
  return {
    tenantId: requiredString(body.tenantId, "tenantId"),
    repoId: requiredString(body.repoId, "repoId")
  };
}

export function parseUpdateStatusBody(value: unknown): {
  tenantId: string;
  repoId: string;
  status: ReturnType<typeof parseStatus>;
  actor: string;
} {
  const body = requireRecord(value);
  return {
    tenantId: requiredString(body.tenantId, "tenantId"),
    repoId: requiredString(body.repoId, "repoId"),
    status: parseStatus(body.status),
    actor: requiredString(body.actor, "actor")
  };
}

export function parseClaimBody(value: unknown): {
  tenantId: string;
  repoId: string;
  claimedBy: string;
  claimDurationMinutes?: number;
} {
  const body = requireRecord(value);
  const durationValue = body.claimDurationMinutes;

  if (
    durationValue !== undefined &&
    (typeof durationValue !== "number" || !Number.isInteger(durationValue) || durationValue < 1)
  ) {
    throw new ValidationError("claimDurationMinutes must be a positive integer");
  }

  return {
    tenantId: requiredString(body.tenantId, "tenantId"),
    repoId: requiredString(body.repoId, "repoId"),
    claimedBy: requiredString(body.claimedBy, "claimedBy"),
    claimDurationMinutes: durationValue
  };
}

export function parseLinksBody(value: unknown): {
  tenantId: string;
  repoId: string;
  externalBranchName?: string;
  externalCommitUrl?: string;
  externalPrUrl?: string;
} {
  const body = requireRecord(value);
  const tenantRepo = parseTenantRepoBody(body);

  return {
    ...tenantRepo,
    externalBranchName:
      typeof body.externalBranchName === "string" ? body.externalBranchName.trim() : undefined,
    externalCommitUrl:
      typeof body.externalCommitUrl === "string" ? body.externalCommitUrl.trim() : undefined,
    externalPrUrl: typeof body.externalPrUrl === "string" ? body.externalPrUrl.trim() : undefined
  };
}

export function errorResponse(error: unknown): HttpResponseInit {
  if (error instanceof ValidationError) {
    return json(400, { error: error.message });
  }

  if (error instanceof WorkItemNotFoundError) {
    return json(404, { error: error.message });
  }

  if (error instanceof WorkItemConflictError) {
    return json(409, { error: error.message });
  }

  if (error instanceof TenantAccessDeniedError) {
    return json(403, { error: error.message });
  }

  return json(500, { error: "Internal server error" });
}
