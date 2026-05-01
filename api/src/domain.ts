export const workItemTypes = ["Issue", "Feature"] as const;
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

export type WorkItemEvent = {
  tenantId: string;
  repoId: string;
  workItemId: string;
  eventId: string;
  eventType: "StatusChanged";
  previousStatus: WorkItemStatus;
  newStatus: WorkItemStatus;
  actor: string;
  createdAt: string;
};

export const severityRank: Record<WorkItemSeverity, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
  Info: 4
};

export function partitionKey(tenantId: string, repoId: string): string {
  return `TENANT#${tenantId}#REPO#${repoId}`;
}
