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
  repositoryId: string;
  workItemType: WorkItemType;
  category: WorkItemCategory;
  title: string;
  severity: WorkItemSeverity;
  status: WorkItemStatus;
  assignedToUserKey: string;
  claimedByUserKey: string;
  createdAt: string;
  updatedAt: string;
  externalLink: string;
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
  createdByUserKey?: string;
  assignedTo: string;
  assignedToUserKey?: string;
  claimedBy: string;
  claimedAt: string;
  claimExpiresAt: string;
  externalBranchName: string;
  externalCommitUrl: string;
  externalPrUrl: string;
};
