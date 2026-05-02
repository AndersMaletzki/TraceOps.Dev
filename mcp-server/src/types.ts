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
  claimedAt: string;
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
