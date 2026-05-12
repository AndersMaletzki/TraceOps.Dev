import { describe, expect, it } from "vitest";
import {
  generatePersonalApiKey,
  hashPersonalApiKey,
  parsePersonalApiKey,
  personalApiKeyHashesMatch
} from "../src/apiKey.js";
import { ApiKeyAuthenticationError, ApiKeyService } from "../src/apiKeyService.js";
import { ApiKeyRepository } from "../src/storage.js";

function createApiKeyService() {
  const items = new Map<string, {
    apiKeyId: string;
    tenantId: string;
    userKey: string;
    name: string;
    keyPrefix: string;
    keyHash: string;
    scopes: ("workitems:read" | "workitems:create" | "workitems:update")[];
    createdAtUtc: string;
    expiresAtUtc: string;
    lastUsedAtUtc: string;
    revokedAtUtc: string;
  }>();

  const repository = {
    createApiKey: async (apiKey) => {
      items.set(`${apiKey.tenantId}|${apiKey.userKey}|${apiKey.apiKeyId}`, apiKey);
      return apiKey;
    },
    getApiKey: async (tenantId: string, userKey: string, apiKeyId: string) => {
      const apiKey = items.get(`${tenantId}|${userKey}|${apiKeyId}`);

      if (!apiKey) {
        throw new Error("Not found");
      }

      return apiKey;
    },
    listApiKeysForUser: async (tenantId: string, userKey: string) =>
      [...items.values()].filter((apiKey) => apiKey.tenantId === tenantId && apiKey.userKey === userKey),
    findApiKeysByPrefix: async (keyPrefix: string) =>
      [...items.values()].filter((apiKey) => apiKey.keyPrefix === keyPrefix),
    upsertApiKey: async (apiKey) => {
      items.set(`${apiKey.tenantId}|${apiKey.userKey}|${apiKey.apiKeyId}`, apiKey);
      return apiKey;
    }
  } as unknown as Pick<
    ApiKeyRepository,
    "createApiKey" | "getApiKey" | "listApiKeysForUser" | "findApiKeysByPrefix" | "upsertApiKey"
  >;

  const authService = {
    assertTenantMember: async (_userKey: string, _tenantId: string) => undefined,
    listUserTenants: async (_userKey: string) => [
      {
        tenantId: "personal~github~123456",
        userKey: "github|123456",
        role: "owner" as const,
        createdAtUtc: ""
      }
    ]
  };

  return {
    items,
    service: new ApiKeyService(repository, authService as never, "super-secret")
  };
}

describe("personal API key helpers", () => {
  it("generates keys in the expected format", () => {
    const apiKey = generatePersonalApiKey();
    const parsed = parsePersonalApiKey(apiKey);

    expect(apiKey).toMatch(/^trc_live_[a-f0-9]{12}_[A-Za-z0-9_-]{43}$/);
    expect(parsed).toMatchObject({
      keyPrefix: expect.stringMatching(/^[a-f0-9]{12}$/),
      secret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
    });
  });

  it("hashes keys with HMAC-SHA256", () => {
    const apiKey = "trc_live_abc123def456_abcdefghijklmnopqrstuvwxyzABCDE12345678";
    const hash = hashPersonalApiKey(apiKey, "super-secret");

    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(personalApiKeyHashesMatch(apiKey, hash, "super-secret")).toBe(true);
    expect(personalApiKeyHashesMatch(apiKey, hash, "other-secret")).toBe(false);
  });
});

describe("ApiKeyService", () => {
  it("creates, lists, and revokes personal API keys without exposing hashes", async () => {
    const { service } = createApiKeyService();

    const created = await service.createApiKey({
      tenantId: "tenant-123",
      userKey: "github|123456",
      name: "Codex CLI",
      scopes: ["workitems:read", "workitems:update"]
    });

    expect(created.apiKey).toMatch(/^trc_live_/);
    expect(created.metadata).toMatchObject({
      tenantId: "tenant-123",
      userKey: "github|123456",
      name: "Codex CLI",
      scopes: ["workitems:read", "workitems:update"],
      revokedAtUtc: ""
    });
    expect("keyHash" in created.metadata).toBe(false);

    const listed = await service.listApiKeysForUser("tenant-123", "github|123456");

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      apiKeyId: created.metadata.apiKeyId,
      name: "Codex CLI"
    });
    expect("keyHash" in listed[0]).toBe(false);

    const revoked = await service.revokeApiKey("tenant-123", "github|123456", created.metadata.apiKeyId);

    expect(revoked.revokedAtUtc).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect("keyHash" in revoked).toBe(false);
  });

  it("rejects revoked keys during authentication", async () => {
    const { service } = createApiKeyService();
    const created = await service.createApiKey({
      tenantId: "tenant-123",
      userKey: "github|123456",
      name: "Codex CLI",
      scopes: ["workitems:read"]
    });

    await service.revokeApiKey("tenant-123", "github|123456", created.metadata.apiKeyId);

    await expect(service.authenticatePersonalApiKey(created.apiKey)).rejects.toBeInstanceOf(
      ApiKeyAuthenticationError
    );
  });

  it("rejects expired keys during authentication", async () => {
    const { service } = createApiKeyService();
    const created = await service.createApiKey({
      tenantId: "tenant-123",
      userKey: "github|123456",
      name: "Codex CLI",
      scopes: ["workitems:read"],
      expiresAtUtc: "2000-01-01T00:00:00.000Z"
    });

    await expect(service.authenticatePersonalApiKey(created.apiKey)).rejects.toBeInstanceOf(
      ApiKeyAuthenticationError
    );
  });

  it("resolves the personal tenant for caller-managed API key routes", async () => {
    const { service } = createApiKeyService();

    await expect(service.resolveTenantIdForUser("github|123456")).resolves.toBe("personal~github~123456");
  });
});
