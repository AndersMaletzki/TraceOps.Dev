export const workItemTypes = ["Issue", "Feature", "AuditFinding"] as const;
export type WorkItemType = (typeof workItemTypes)[number];

export const workItemCategories = [
  "Security",
  "Bug",
  "Infra",
  "Refactor",
  "Documentation",
  "Performance",
  "TechnicalDebt",
  "Idea"
] as const;
export type WorkItemCategory = (typeof workItemCategories)[number];

export const workItemSeverities = ["Critical", "High", "Medium", "Low", "Info"] as const;
export type WorkItemSeverity = (typeof workItemSeverities)[number];

export const workItemStatuses = [
  "New",
  "Accepted",
  "Claimed",
  "InProgress",
  "InReview",
  "Fixed",
  "Closed",
  "WontFix"
] as const;
export type WorkItemStatus = (typeof workItemStatuses)[number];

export const tenantTypes = ["personal", "team"] as const;
export type TenantType = (typeof tenantTypes)[number];

export const tenantMemberRoles = ["owner", "admin", "member", "viewer"] as const;
export type TenantMemberRole = (typeof tenantMemberRoles)[number];

export type TraceOpsUser = {
  userKey: string;
  identityProvider: string;
  providerUserId: string;
  userDetails: string;
  displayName: string;
  createdAtUtc: string;
  lastLoginAtUtc: string;
  loginCount: number;
  isAdmin: boolean;
};

export type TraceOpsTenant = {
  tenantId: string;
  tenantType: TenantType;
  name: string;
  createdByUserKey: string;
  createdAtUtc: string;
};

export type TraceOpsTenantMember = {
  tenantId: string;
  userKey: string;
  role: TenantMemberRole;
  createdAtUtc: string;
};

export type SyncUserInput = {
  identityProvider: string;
  providerUserId: string;
  userDetails: string;
  displayName?: string;
  roles: string[];
};

export type SyncUserResult = {
  user: TraceOpsUser;
  personalTenant: TraceOpsTenant;
  memberships: TraceOpsTenantMember[];
};

export type WorkItem = {
  tenantId: string;
  repoId: string;
  workItemId: string;
  workItemType: WorkItemType;
  category: WorkItemCategory;
  title: string;
  description: string;
  severity: WorkItemSeverity;
  status: WorkItemStatus;
  source: string;
  files: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  assignedTo: string;
  claimedBy: string;
  claimedAt: string;
  claimExpiresAt: string;
  externalBranchName: string;
  externalCommitUrl: string;
  externalPrUrl: string;
};

export type CreateWorkItemInput = {
  tenantId: string;
  repoId: string;
  workItemType: WorkItemType;
  category: WorkItemCategory;
  title: string;
  description: string;
  severity: WorkItemSeverity;
  status?: WorkItemStatus;
  source: string;
  files?: string[];
  tags?: string[];
  createdBy: string;
  assignedTo?: string;
  externalBranchName?: string;
  externalCommitUrl?: string;
  externalPrUrl?: string;
};

export type WorkItemFilters = {
  tenantId: string;
  repoId: string;
  status?: WorkItemStatus;
  severity?: WorkItemSeverity;
  workItemType?: WorkItemType;
  category?: WorkItemCategory;
  limit: number;
};

export type UpdateStatusInput = {
  tenantId: string;
  repoId: string;
  status: WorkItemStatus;
  actor: string;
};

export type ClaimWorkItemInput = {
  tenantId: string;
  repoId: string;
  claimedBy: string;
  claimDurationMinutes?: number;
};

export type UpdateLinksInput = {
  tenantId: string;
  repoId: string;
  externalBranchName?: string;
  externalCommitUrl?: string;
  externalPrUrl?: string;
};

type WorkItemEventBase = {
  tenantId: string;
  repoId: string;
  workItemId: string;
  eventId: string;
  actor?: string;
  createdAt: string;
};

export type WorkItemEvent =
  | (WorkItemEventBase & {
      eventType: "Created";
      workItemType: WorkItemType;
      status: WorkItemStatus;
    })
  | (WorkItemEventBase & {
      eventType: "StatusChanged";
      previousStatus: WorkItemStatus;
      newStatus: WorkItemStatus;
      actor: string;
    })
  | (WorkItemEventBase & {
      eventType: "Claimed";
      claimedBy: string;
      claimExpiresAt: string;
    })
  | (WorkItemEventBase & {
      eventType: "Released";
      releasedBy: string;
    })
  | (WorkItemEventBase & {
      eventType: "LinksUpdated";
      externalBranchName: string;
      externalCommitUrl: string;
      externalPrUrl: string;
    })
  | (WorkItemEventBase & {
      eventType: "Assigned";
      assignedTo: string;
    })
  | (WorkItemEventBase & {
      eventType: "CommentAdded";
      comment: string;
    });

export const severityRank: Record<WorkItemSeverity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4
};

function tableKeySegment(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

export function partitionKey(tenantId: string, repoId: string): string {
  return `TENANT~${tableKeySegment(tenantId)}~REPO~${tableKeySegment(repoId)}`;
}
