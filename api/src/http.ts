import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { AdminAccessDeniedError } from "./adminMetricsService.js";
import { apiKeysMatch } from "./apiKey.js";
import { ApiKeyAuthenticationError, ApiKeyScopeDeniedError, ApiKeyService } from "./apiKeyService.js";
import { TenantAccessDeniedError } from "./authService.js";
import { TraceOpsConfig } from "./config.js";
import { apiKeyScopes, ApiKeyScope, AuthContext } from "./domain.js";
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
  AppWorkItemFilters,
  workItemCategories,
  workItemSeverities,
  workItemStatuses,
  workItemTypes,
  WorkItemFilters,
  WorkItemReadView
} from "./domain.js";
import { WorkItemConflictError, WorkItemNotFoundError } from "./workItemService.js";

export function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body
  };
}

export function authenticateTrustedRequest(
  request: HttpRequest,
  config: TraceOpsConfig
): HttpResponseInit | undefined {
  const suppliedApiKey = request.headers.get("x-api-key");

  if (!suppliedApiKey || !apiKeysMatch(suppliedApiKey, config.apiKey)) {
    return json(401, { error: "Unauthorized" });
  }

  return undefined;
}

function parseBearerToken(request: HttpRequest): string | undefined {
  const authorizationHeader = request.headers.get("authorization")?.trim();

  if (!authorizationHeader) {
    return undefined;
  }

  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader);
  return match?.[1]?.trim() || undefined;
}

export async function authenticate(
  request: HttpRequest,
  config: TraceOpsConfig,
  apiKeyService?: ApiKeyService
): Promise<AuthContext | HttpResponseInit> {
  const suppliedApiKey = request.headers.get("x-api-key");

  if (suppliedApiKey && apiKeysMatch(suppliedApiKey, config.apiKey)) {
    return {
      kind: "global",
      userKey: parseCallerUserKey(request),
      tenantId: parseTrustedTenantId(request),
      scopes: [...apiKeyScopes]
    };
  }

  const bearerToken = parseBearerToken(request);

  if (bearerToken && apiKeyService) {
    try {
      return await apiKeyService.authenticatePersonalApiKey(bearerToken);
    } catch (error) {
      if (error instanceof ApiKeyAuthenticationError) {
        return json(401, { error: "Unauthorized" });
      }

      throw error;
    }
  }

  return json(401, { error: "Unauthorized" });
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
    workItemId: request.query.get("workItemId")?.trim() || undefined,
    limit: parseLimit(request.query.get("limit"))
  };
}

export function parseWorkItemReadView(request: HttpRequest): WorkItemReadView {
  return parseOptionalEnum(request.query.get("view"), ["summary", "detail"] as const, "view") || "detail";
}

export function parseCallerUserKey(request: HttpRequest): string | undefined {
  const value =
    request.headers.get("x-traceops-user-key") ||
    request.headers.get("x-user-key");
  const trimmed = value?.trim();

  return trimmed || undefined;
}

export function parseTrustedTenantId(request: HttpRequest): string | undefined {
  const value = request.headers.get("x-traceops-tenant-id");
  const trimmed = value?.trim();

  return trimmed || undefined;
}

export function callerUserKeyFromAuth(request: HttpRequest, auth: AuthContext): string | undefined {
  return auth.kind === "personal" ? auth.userKey : parseCallerUserKey(request);
}

export class UnsupportedTenantScopedAuthError extends Error {
  constructor() {
    super(
      "Tenant-scoped work item routes require Authorization: Bearer <personal-api-key>. Raw x-api-key access is only supported for backend-owned website routes."
    );
    this.name = "UnsupportedTenantScopedAuthError";
  }
}

export function assertTenantScopedWorkItemAuth(auth: AuthContext): void {
  if (auth.kind !== "personal") {
    throw new UnsupportedTenantScopedAuthError();
  }
}

export function assertAuthorizedTenant(auth: AuthContext, tenantId: string): void {
  if (auth.kind === "personal" && auth.tenantId !== tenantId) {
    throw new TenantAccessDeniedError(tenantId);
  }
}

export function assertApiKeyScope(auth: AuthContext, requiredScope: ApiKeyScope): void {
  if (auth.kind === "personal" && !auth.scopes.includes(requiredScope)) {
    throw new ApiKeyScopeDeniedError(requiredScope);
  }
}

export function parseAppWorkItemFiltersFromQuery(request: HttpRequest): AppWorkItemFilters {
  return {
    tenantId: request.query.get("tenantId")?.trim() || undefined,
    repoId: request.query.get("repoId")?.trim() || undefined,
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

  if (error instanceof ApiKeyScopeDeniedError) {
    return json(403, { error: error.message });
  }

  if (error instanceof UnsupportedTenantScopedAuthError) {
    return json(403, { error: error.message });
  }

  if (error instanceof AdminAccessDeniedError) {
    return json(403, { error: error.message });
  }

  return json(500, { error: "Internal server error" });
}
