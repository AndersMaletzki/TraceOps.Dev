import { IssueMetrics, TraceOpsUser, UserMetrics, WorkItem } from "./domain.js";
import { isStorageNotFound, toWorkItem, UserRepository, WorkItemRepository } from "./storage.js";

type UserStore = Pick<UserRepository, "getUser" | "listUsers">;
type WorkItemStore = Pick<WorkItemRepository, "listAllWorkItems">;

export class AdminAccessDeniedError extends Error {
  constructor() {
    super("Admin access is required");
    this.name = "AdminAccessDeniedError";
  }
}

function isAtOrAfter(value: string, threshold: Date): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= threshold.getTime();
}

function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function providerIsMicrosoft(user: TraceOpsUser): boolean {
  const provider = user.identityProvider.toLowerCase();
  return provider === "aad" || provider === "microsoft" || provider === "entra";
}

export class AdminMetricsService {
  constructor(
    private readonly users: UserStore,
    private readonly workItems: WorkItemStore
  ) {}

  async assertAdminUser(userKey: string): Promise<void> {
    try {
      const user = await this.users.getUser(userKey);
      if (!user.isAdmin) {
        throw new AdminAccessDeniedError();
      }
    } catch (error) {
      if (error instanceof AdminAccessDeniedError) {
        throw error;
      }

      if (isStorageNotFound(error)) {
        throw new AdminAccessDeniedError();
      }

      throw error;
    }
  }

  async getUserMetrics(now = new Date()): Promise<UserMetrics> {
    const users = await this.users.listUsers();
    const last7Days = daysAgo(7, now);
    const last30Days = daysAgo(30, now);

    return {
      totalUsers: users.length,
      githubUsers: users.filter((user) => user.identityProvider.toLowerCase() === "github").length,
      microsoftUsers: users.filter(providerIsMicrosoft).length,
      adminUsers: users.filter((user) => user.isAdmin).length,
      usersCreatedLast7Days: users.filter((user) => isAtOrAfter(user.createdAtUtc, last7Days)).length,
      activeUsersLast30Days: users.filter((user) => isAtOrAfter(user.lastLoginAtUtc, last30Days)).length
    };
  }

  async getIssueMetrics(now = new Date()): Promise<IssueMetrics> {
    const workItems = (await this.workItems.listAllWorkItems(10000)).map(toWorkItem);
    const last7Days = daysAgo(7, now);

    return {
      totalIssues: workItems.length,
      openIssues: workItems.filter((workItem) => isOpen(workItem)).length,
      fixedIssues: workItems.filter((workItem) => workItem.status === "Fixed").length,
      closedIssues: workItems.filter((workItem) => workItem.status === "Closed").length,
      issuesCreatedLast7Days: workItems.filter((workItem) => isAtOrAfter(workItem.createdAt, last7Days)).length
    };
  }
}

function isOpen(workItem: WorkItem): boolean {
  return workItem.status !== "Fixed" && workItem.status !== "Closed" && workItem.status !== "WontFix";
}
