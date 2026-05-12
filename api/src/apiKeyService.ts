import { randomUUID } from "node:crypto";
import {
  apiKeyScopes,
  ApiKeyMetadata,
  CreateApiKeyInput,
  CreateApiKeyResult,
  PersonalApiKeyAuthContext,
  TraceOpsApiKey
} from "./domain.js";
import {
  generatePersonalApiKey,
  hashPersonalApiKey,
  parsePersonalApiKey,
  personalApiKeyHashesMatch
} from "./apiKey.js";
import { AuthService, chooseActiveTenantId } from "./authService.js";
import { ApiKeyRepository, toApiKeyMetadata } from "./storage.js";
import { ValidationError } from "./validation.js";

function isoNow(date = new Date()): string {
  return date.toISOString();
}

function newApiKeyId(): string {
  return `key_${randomUUID().replace(/-/g, "")}`;
}

function hasExpired(expiresAtUtc: string, now = new Date()): boolean {
  if (!expiresAtUtc) {
    return false;
  }

  const expiresAt = Date.parse(expiresAtUtc);
  return Number.isFinite(expiresAt) && expiresAt <= now.getTime();
}

export class ApiKeyAuthenticationError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ApiKeyAuthenticationError";
  }
}

export class ApiKeyScopeDeniedError extends Error {
  constructor(scope: string) {
    super(`API key does not include required scope: ${scope}`);
    this.name = "ApiKeyScopeDeniedError";
  }
}

export class ApiKeyService {
  constructor(
    private readonly repository: Pick<
      ApiKeyRepository,
      "createApiKey" | "getApiKey" | "listApiKeysForUser" | "findApiKeysByPrefix" | "upsertApiKey"
    >,
    private readonly authService: Pick<AuthService, "assertTenantMember" | "listUserTenants">,
    private readonly hashSecret: string
  ) {}

  async createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    await this.authService.assertTenantMember(input.userKey, input.tenantId);

    const apiKey = generatePersonalApiKey();
    const parsed = parsePersonalApiKey(apiKey);

    if (!parsed) {
      throw new Error("Generated API key did not match the expected format");
    }

    const now = isoNow();
    const storedApiKey: TraceOpsApiKey = {
      apiKeyId: newApiKeyId(),
      tenantId: input.tenantId,
      userKey: input.userKey,
      name: input.name,
      keyPrefix: parsed.keyPrefix,
      keyHash: hashPersonalApiKey(apiKey, this.hashSecret),
      scopes: input.scopes.length > 0 ? [...input.scopes] : [...apiKeyScopes],
      createdAtUtc: now,
      expiresAtUtc: input.expiresAtUtc || "",
      lastUsedAtUtc: "",
      revokedAtUtc: ""
    };

    const created = await this.repository.createApiKey(storedApiKey);

    return {
      apiKey,
      metadata: toApiKeyMetadata(created)
    };
  }

  async listApiKeysForUser(tenantId: string, userKey: string): Promise<ApiKeyMetadata[]> {
    await this.authService.assertTenantMember(userKey, tenantId);
    const apiKeys = await this.repository.listApiKeysForUser(tenantId, userKey);
    return apiKeys.map((apiKey) => toApiKeyMetadata(apiKey));
  }

  async revokeApiKey(tenantId: string, userKey: string, apiKeyId: string): Promise<ApiKeyMetadata> {
    await this.authService.assertTenantMember(userKey, tenantId);
    const apiKey = await this.repository.getApiKey(tenantId, userKey, apiKeyId);

    if (apiKey.revokedAtUtc) {
      return toApiKeyMetadata(apiKey);
    }

    const revoked = await this.repository.upsertApiKey({
      ...apiKey,
      revokedAtUtc: isoNow()
    });

    return toApiKeyMetadata(revoked);
  }

  async resolveTenantIdForUser(userKey: string, requestedTenantId?: string): Promise<string> {
    if (requestedTenantId) {
      await this.authService.assertTenantMember(userKey, requestedTenantId);
      return requestedTenantId;
    }

    const memberships = await this.authService.listUserTenants(userKey);
    const tenantId = chooseActiveTenantId(memberships);

    if (!tenantId) {
      throw new ValidationError("No accessible tenant found for caller");
    }

    return tenantId;
  }

  async authenticatePersonalApiKey(rawApiKey: string): Promise<PersonalApiKeyAuthContext> {
    const parsed = parsePersonalApiKey(rawApiKey);

    if (!parsed) {
      throw new ApiKeyAuthenticationError();
    }

    const candidates = await this.repository.findApiKeysByPrefix(parsed.keyPrefix);
    const matchedApiKey = candidates.find((candidate) =>
      personalApiKeyHashesMatch(rawApiKey, candidate.keyHash, this.hashSecret)
    );

    if (!matchedApiKey) {
      throw new ApiKeyAuthenticationError();
    }

    if (matchedApiKey.revokedAtUtc || hasExpired(matchedApiKey.expiresAtUtc)) {
      throw new ApiKeyAuthenticationError();
    }

    await this.repository.upsertApiKey({
      ...matchedApiKey,
      lastUsedAtUtc: isoNow()
    });

    return {
      kind: "personal",
      apiKeyId: matchedApiKey.apiKeyId,
      tenantId: matchedApiKey.tenantId,
      userKey: matchedApiKey.userKey,
      scopes: [...matchedApiKey.scopes]
    };
  }
}
