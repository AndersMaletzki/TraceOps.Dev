export const workItemTypes = ["Issue", "Feature", "AuditFinding"] as const;
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
export const workItemSeverities = ["Critical", "High", "Medium", "Low", "Info"] as const;
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

export type WorkItemType = (typeof workItemTypes)[number];
export type WorkItemCategory = (typeof workItemCategories)[number];
export type WorkItemSeverity = (typeof workItemSeverities)[number];
export type WorkItemStatus = (typeof workItemStatuses)[number];

export type WorkItemSummary = {
  workItemId: string;
  workItemType: WorkItemType;
  category: WorkItemCategory;
  title: string;
  severity: WorkItemSeverity;
  status: WorkItemStatus;
  assignedTo: string;
  assignedToUserKey?: string;
  claimedBy: string;
  claimExpiresAt: string;
  updatedAt: string;
  externalBranchName: string;
  externalCommitUrl: string;
  externalPrUrl: string;
};

export type WorkItem = WorkItemSummary & {
  tenantId: string;
  repoId: string;
  description: string;
  source: string;
  files: string[];
  tags: string[];
  createdAt: string;
  createdBy: string;
  createdByUserKey?: string;
  claimedAt: string;
};
