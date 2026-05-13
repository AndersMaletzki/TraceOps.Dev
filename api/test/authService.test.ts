import { describe, expect, it } from "vitest";
import { AuthService } from "../src/authService.js";
import { TraceOpsTenant, TraceOpsTenantMember, TraceOpsUser } from "../src/domain.js";
import { TenantMemberRepository, TenantRepository, UserRepository } from "../src/storage.js";

function notFound(): Error & { statusCode: number } {
  return Object.assign(new Error("Not found"), { statusCode: 404 });
}

function createStores() {
  const users = new Map<string, TraceOpsUser>();
  const tenants = new Map<string, TraceOpsTenant>();
  const memberships = new Map<string, TraceOpsTenantMember>();

  const userRepository = {
    createUser: async (user: TraceOpsUser) => {
      users.set(user.userKey, user);
      return user;
    },
    getUser: async (userKey: string) => {
      const user = users.get(userKey);
      if (!user) {
        throw notFound();
      }

      return user;
    },
    upsertUser: async (user: TraceOpsUser) => {
      users.set(user.userKey, user);
      return user;
    }
  } as unknown as UserRepository;

  const tenantRepository = {
    createTenant: async (tenant: TraceOpsTenant) => {
      tenants.set(tenant.tenantId, tenant);
      return tenant;
    },
    getTenant: async (tenantId: string) => {
      const tenant = tenants.get(tenantId);
      if (!tenant) {
        throw notFound();
      }

      return tenant;
    }
  } as unknown as TenantRepository;

  const tenantMemberRepository = {
    createTenantMember: async (member: TraceOpsTenantMember) => {
      memberships.set(`${member.tenantId}|${member.userKey}`, member);
      return member;
    },
    getTenantMember: async (tenantId: string, userKey: string) => {
      const membership = memberships.get(`${tenantId}|${userKey}`);
      if (!membership) {
        throw notFound();
      }

      return membership;
    },
    listTenantMembers: async (tenantId: string) =>
      [...memberships.values()].filter((membership) => membership.tenantId === tenantId),
    listTenantMembershipsForUser: async (userKey: string) =>
      [...memberships.values()].filter((membership) => membership.userKey === userKey)
  } as unknown as TenantMemberRepository;

  return {
    users,
    tenants,
    memberships,
    service: new AuthService(userRepository, tenantRepository, tenantMemberRepository)
  };
}

describe("AuthService", () => {
  it("creates a synced user, personal tenant, and owner membership", async () => {
    const { service } = createStores();

    const result = await service.syncUser({
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octo Cat",
      roles: ["anonymous"]
    });

    expect(result.user).toMatchObject({
      userKey: "github|123456",
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octo Cat",
      loginCount: 1,
      isAdmin: false
    });
    expect(result.personalTenant).toMatchObject({
      tenantId: "personal~github~123456",
      tenantType: "personal",
      name: "Octo Cat",
      createdByUserKey: "github|123456"
    });
    expect(result.memberships).toEqual([
      expect.objectContaining({
        tenantId: "personal~github~123456",
        userKey: "github|123456",
        role: "owner"
      })
    ]);
    expect(result.bootstrap).toEqual({
      user: result.user,
      personalTenant: result.personalTenant,
      memberships: result.memberships
    });
    expect(Object.keys(result).sort()).toEqual(["bootstrap", "memberships", "personalTenant", "user"]);
  });

  it("updates login metadata and admin state on every sync without recreating the tenant", async () => {
    const { service } = createStores();
    const first = await service.syncUser({
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octo Cat",
      roles: []
    });

    const second = await service.syncUser({
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octavia Cat",
      roles: ["admin"]
    });

    expect(second.user.loginCount).toBe(2);
    expect(second.user.isAdmin).toBe(false);
    expect(second.user.displayName).toBe("Octavia Cat");
    expect(second.user.createdAtUtc).toBe(first.user.createdAtUtc);
    expect(Date.parse(second.user.lastLoginAtUtc)).toBeGreaterThanOrEqual(
      Date.parse(first.user.lastLoginAtUtc)
    );
    expect(second.personalTenant).toEqual(first.personalTenant);
    expect(second.memberships).toHaveLength(1);
  });

  it("does not create an admin user from caller-supplied sync roles", async () => {
    const { service } = createStores();

    const result = await service.syncUser({
      identityProvider: "github",
      providerUserId: "999999",
      userDetails: "admin-attempt@example.com",
      displayName: "Admin Attempt",
      roles: ["admin"]
    });

    expect(result.user.isAdmin).toBe(false);
  });

  it("preserves existing admin users even when sync roles do not include admin", async () => {
    const { service, users } = createStores();

    users.set("github|123456", {
      userKey: "github|123456",
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octo Cat",
      createdAtUtc: "2026-05-01T00:00:00.000Z",
      lastLoginAtUtc: "2026-05-01T00:00:00.000Z",
      loginCount: 5,
      isAdmin: true
    });

    const result = await service.syncUser({
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octavia Cat",
      roles: ["member"]
    });

    expect(result.user.isAdmin).toBe(true);
    expect(result.user.loginCount).toBe(6);
  });

  it("does not promote an existing non-admin user from caller-supplied sync roles", async () => {
    const { service, users } = createStores();

    users.set("github|123456", {
      userKey: "github|123456",
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octo Cat",
      createdAtUtc: "2026-05-01T00:00:00.000Z",
      lastLoginAtUtc: "2026-05-01T00:00:00.000Z",
      loginCount: 2,
      isAdmin: false
    });

    const result = await service.syncUser({
      identityProvider: "github",
      providerUserId: "123456",
      userDetails: "octocat@example.com",
      displayName: "Octavia Cat",
      roles: ["admin"]
    });

    expect(result.user.isAdmin).toBe(false);
    expect(result.user.loginCount).toBe(3);
  });

  it("uses userDetails as the fallback display name for personal tenants", async () => {
    const { service } = createStores();

    const result = await service.syncUser({
      identityProvider: "aad",
      providerUserId: "user-1",
      userDetails: "person@example.com",
      roles: []
    });

    expect(result.user.displayName).toBe("person@example.com");
    expect(result.personalTenant.name).toBe("person@example.com");
  });
});
