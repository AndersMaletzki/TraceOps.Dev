import {
  SyncUserInput,
  SyncUserResult,
  TraceOpsTenant,
  TraceOpsTenantMember,
  TraceOpsUser
} from "./domain.js";
import {
  isStorageConflict,
  isStorageNotFound,
  TenantMemberRepository,
  TenantRepository,
  UserRepository
} from "./storage.js";

type UserStore = Pick<UserRepository, "createUser" | "getUser" | "upsertUser">;
type TenantStore = Pick<TenantRepository, "createTenant" | "getTenant">;
type TenantMemberStore = Pick<
  TenantMemberRepository,
  "createTenantMember" | "getTenantMember" | "listTenantMembers" | "listTenantMembershipsForUser"
>;

function isoNow(date = new Date()): string {
  return date.toISOString();
}

export function buildUserKey(input: Pick<SyncUserInput, "identityProvider" | "providerUserId">): string {
  return `${input.identityProvider}|${input.providerUserId}`;
}

export function buildPersonalTenantId(
  input: Pick<SyncUserInput, "identityProvider" | "providerUserId">
): string {
  return `personal~${input.identityProvider}~${input.providerUserId}`;
}

function displayNameOrUserDetails(input: Pick<SyncUserInput, "displayName" | "userDetails">): string {
  return input.displayName?.trim() || input.userDetails;
}

async function getOrUndefined<T>(operation: () => Promise<T>): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    if (isStorageNotFound(error)) {
      return undefined;
    }

    throw error;
  }
}

export class TenantAccessDeniedError extends Error {
  constructor(tenantId: string) {
    super(`User is not a member of tenant: ${tenantId}`);
    this.name = "TenantAccessDeniedError";
  }
}

export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly tenants: TenantStore,
    private readonly tenantMembers: TenantMemberStore
  ) {}

  async syncUser(input: SyncUserInput): Promise<SyncUserResult> {
    const now = isoNow();
    const userKey = buildUserKey(input);
    const existingUser = await getOrUndefined(() => this.users.getUser(userKey));
    const user = await this.upsertSyncedUser(input, existingUser, now);
    const personalTenant = await this.ensurePersonalTenant(input, user.userKey, now);
    const ownerMembership = await this.ensureOwnerMembership(personalTenant.tenantId, user.userKey, now);
    const memberships = await this.tenantMembers.listTenantMembers(personalTenant.tenantId);

    if (
      !memberships.some(
        (membership) =>
          membership.tenantId === ownerMembership.tenantId &&
          membership.userKey === ownerMembership.userKey
      )
    ) {
      memberships.push(ownerMembership);
    }

    return {
      user,
      personalTenant,
      memberships
    };
  }

  async assertTenantMember(userKey: string, tenantId: string): Promise<void> {
    const membership = await getOrUndefined(() => this.tenantMembers.getTenantMember(tenantId, userKey));

    if (!membership) {
      throw new TenantAccessDeniedError(tenantId);
    }
  }

  async listUserTenants(userKey: string): Promise<TraceOpsTenantMember[]> {
    return this.tenantMembers.listTenantMembershipsForUser(userKey);
  }

  private async upsertSyncedUser(
    input: SyncUserInput,
    existingUser: TraceOpsUser | undefined,
    now: string
  ): Promise<TraceOpsUser> {
    const user: TraceOpsUser = {
      userKey: buildUserKey(input),
      identityProvider: input.identityProvider,
      providerUserId: input.providerUserId,
      userDetails: input.userDetails,
      displayName: displayNameOrUserDetails(input),
      createdAtUtc: existingUser?.createdAtUtc || now,
      lastLoginAtUtc: now,
      loginCount: (existingUser?.loginCount || 0) + 1,
      isAdmin: input.roles.includes("admin")
    };

    if (!existingUser) {
      try {
        return await this.users.createUser(user);
      } catch (error) {
        if (!isStorageConflict(error)) {
          throw error;
        }

        const racedUser = await this.users.getUser(user.userKey);
        return this.upsertSyncedUser(input, racedUser, now);
      }
    }

    return this.users.upsertUser(user);
  }

  private async ensurePersonalTenant(
    input: SyncUserInput,
    userKey: string,
    now: string
  ): Promise<TraceOpsTenant> {
    const tenantId = buildPersonalTenantId(input);
    const existingTenant = await getOrUndefined(() => this.tenants.getTenant(tenantId));

    if (existingTenant) {
      return existingTenant;
    }

    const tenant: TraceOpsTenant = {
      tenantId,
      tenantType: "personal",
      name: displayNameOrUserDetails(input),
      createdByUserKey: userKey,
      createdAtUtc: now
    };

    try {
      return await this.tenants.createTenant(tenant);
    } catch (error) {
      if (isStorageConflict(error)) {
        return this.tenants.getTenant(tenantId);
      }

      throw error;
    }
  }

  private async ensureOwnerMembership(
    tenantId: string,
    userKey: string,
    now: string
  ): Promise<TraceOpsTenantMember> {
    const existingMembership = await getOrUndefined(() =>
      this.tenantMembers.getTenantMember(tenantId, userKey)
    );

    if (existingMembership) {
      return existingMembership;
    }

    const membership: TraceOpsTenantMember = {
      tenantId,
      userKey,
      role: "owner",
      createdAtUtc: now
    };

    try {
      return await this.tenantMembers.createTenantMember(membership);
    } catch (error) {
      if (isStorageConflict(error)) {
        return this.tenantMembers.getTenantMember(tenantId, userKey);
      }

      throw error;
    }
  }
}
