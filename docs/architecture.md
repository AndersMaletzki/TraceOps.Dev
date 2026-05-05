# Architecture

TraceOps.Dev v0.1 is a minimal coordination service for AI agents working on repository audits and operational workflows.

It persists structured issues, features, audit findings, and workflow state. It does not modify repositories or perform autonomous git operations.

## v0.1 Architecture

```text
Codex / AI Agent
  -> MCP Server
  -> TraceOps API
  -> Azure Table Storage
```

## Components

| Component | Technology | Purpose |
|---|---|---|
| API | TypeScript + Azure Functions | Validates requests, enforces API key auth, and reads/writes work items |
| Storage | Azure Table Storage | Stores work items and append-only work item events |
| MCP Server | TypeScript + official MCP SDK | Exposes concise agent tools that call the API |
| Infrastructure | Bicep | Defines Azure workload resources |
| GitHub Actions | OIDC + Azure CLI | Validates, previews, and deploys infra/app changes |

## Scope

TraceOps.Dev v0.1 supports:

- issue tracking
- feature tracking
- audit finding tracking
- workflow state tracking for AI agents

## Product Data Ownership

TraceOps.Dev owns the product data required to run repository workflow tracking:

- `Users`
- `Tenants`
- `TenantMembers`
- `WorkItems`
- `WorkItemEvents`

The website, MCP server, and other clients integrate with TraceOps.Dev; they are not the source of truth for users, tenants, tenant membership, work item access, or workflow state.

TraceOps.Dev is open-source friendly. Repository schemas, infrastructure templates, and API contracts can be public. Real user data, tenant data, membership data, secrets, API keys, connection strings, and production identifiers must remain private.

TraceOps.Dev v0.1 does not support:

- branch creation
- commits or pushes
- PR creation
- repository modification
- billing
- notifications
- analytics
- advanced auth
- GitHub Apps
- dashboards or UI

## API

All endpoints require `x-api-key`. `TRACEOPS_API_KEY` stores the lowercase SHA-256 hash of the API key, and clients send the raw API key as the bearer value. The API hashes the incoming key before comparing.

```text
POST  /workitems
GET   /workitems
GET   /workitems/{workItemId}
GET   /workitems/next
PATCH /workitems/{workItemId}/status
PATCH /workitems/{workItemId}/claim
PATCH /workitems/{workItemId}/links
POST  /auth/sync-user
GET   /app/workitems
GET   /admin/metrics/users
GET   /admin/metrics/issues
```

`tenantId` and `repoId` are required for MCP-style repository work item operations so queries stay inside one Table Storage partition. The website-facing `GET /app/workitems` endpoint accepts an optional `repoId`; when omitted, TraceOps.Dev returns work items across accessible tenant repositories and includes `repositoryOptions` from API-owned work item data.

`POST /auth/sync-user` is a trusted backend integration endpoint for the website. The website backend derives the authenticated identity from Azure Static Web Apps auth headers and calls TraceOps with `x-api-key`; browser-provided identity is not trusted. The endpoint creates or updates the user, updates login metadata, stores `isAdmin` when roles contain `admin`, creates a personal tenant when missing, and ensures an owner tenant membership exists.

TraceOps.Dev-website is a thin server-side proxy. It sends `x-api-key` and, for app reads, `x-traceops-user-key` derived from trusted auth context. Browser code never receives `TRACEOPS_API_KEY` and never reads or writes product Table Storage directly. Product authorization belongs in TraceOps.Dev API; the website must not duplicate tenant membership validation as the source of truth.

`GET /app/workitems` validates the caller's tenant membership before returning tenant-scoped data. Its response includes `caller`, `activeTenant`, `repoId`, `repositoryOptions`, `items`, and `count`.

Admin metrics endpoints require `x-api-key` and `x-traceops-user-key` for a stored TraceOps user with `isAdmin = true`. They aggregate from TraceOps-owned storage and return JSON counts only:

- `GET /admin/metrics/users`: `totalUsers`, `githubUsers`, `microsoftUsers`, `adminUsers`, `usersCreatedLast7Days`, `activeUsersLast30Days`
- `GET /admin/metrics/issues`: `totalIssues`, `openIssues`, `fixedIssues`, `closedIssues`, `issuesCreatedLast7Days`

Website and backend integrations must use stable provider identity, represented by `identityProvider` + `providerUserId`. Email may be stored as user detail or display metadata, but integrations must not use email as the primary identity because emails can change and are not guaranteed to be unique across providers.

Browser clients must not be allowed to choose arbitrary tenant access. A trusted backend must derive the caller identity, resolve or verify tenant membership, and pass only authorized `tenantId` values to TraceOps.Dev.

## Access Boundaries

`tenantId` is the product access boundary. Tenant membership controls whether a user can access work items in that tenant.

Work items remain partitioned by `tenantId` + `repoId`:

```text
TENANT~<tenantId> + REPO~<repoId>
```

`repoId` isolates repository workflow state inside a tenant, but it is not sufficient for authorization by itself. Access checks are tenant membership checks first, then repository partition selection.

`createdByUserKey` and `assignedToUserKey` are audit and display fields only. They help show who created or is assigned to a work item, but they do not grant access, prove the caller's identity, or replace tenant membership.

## Storage Design

v0.1 stores product-owned data in Azure Table Storage tables:

- `WorkItems`
- `WorkItemEvents`
- `TraceOpsUsers`
- `TraceOpsTenants`
- `TraceOpsTenantMembers`

Work item keys:

```text
PartitionKey = TENANT~<base64url(tenantId)>~REPO~<base64url(repoId)>
RowKey       = ITEM~<yyyyMMddHHmmss>~<shortId>
```

Work item event keys:

```text
PartitionKey = TENANT~<base64url(tenantId)>~REPO~<base64url(repoId)>
RowKey       = EVT~<yyyyMMddHHmmss>~<shortId>
```

`workItemId` is the full work item RowKey. Clients treat it as opaque.

`files` and `tags` are arrays in API and MCP payloads. They are stored as JSON strings in Table Storage.

## Work Item Contract

Work item fields:

- `tenantId`
- `repoId`
- `workItemId`
- `workItemType`
- `category`
- `severity`
- `status`
- `title`
- `description`
- `source`
- `files`
- `tags`
- `createdAt`
- `updatedAt`
- `createdBy`
- `createdByUserKey` (audit/display only)
- `assignedTo`
- `assignedToUserKey` (audit/display only)
- `claimedBy`
- `claimedAt`
- `claimExpiresAt`
- `externalBranchName`
- `externalCommitUrl`
- `externalPrUrl`

Allowed work item types:

- `Issue`
- `Feature`
- `AuditFinding`

Allowed categories:

- `Security`
- `Bug`
- `Infra`
- `Refactor`
- `Documentation`
- `Performance`
- `TechnicalDebt`
- `Idea`

Allowed severities:

- `Critical`
- `High`
- `Medium`
- `Low`
- `Info`

Allowed statuses:

- `New`
- `Accepted`
- `Claimed`
- `InProgress`
- `InReview`
- `Fixed`
- `Closed`
- `WontFix`

Append-only event types:

- `Created`
- `StatusChanged`
- `Claimed`
- `Released`
- `LinksUpdated`
- `Assigned`
- `CommentAdded`

## Coordination Rules

- `GET /workitems` defaults `limit` to `10` and caps it at `50`.
- `GET /workitems/next` defaults to `New` and `Accepted` items, sorted by severity then oldest created time.
- Create, status update, claim, and link update operations write append-only `WorkItemEvents` records.
- Claims record `claimedBy`, `claimedAt`, and `claimExpiresAt`.
- Active unexpired claims by another claimant return `409 Conflict`.
- Link updates store only external branch, commit, and PR metadata.
- User sync returns `user`, `personalTenant`, and `memberships` without secrets or API keys.

## Deployment

TraceOps.Dev uses two GitHub OIDC app registrations. `AZURE_INFRA_CLIENT_ID` is provisioned by the `azure-bicep-configs` bootstrap and has subscription-level permissions for infrastructure deployment. `AZURE_CLIENT_ID` is provisioned by this monorepo's infrastructure deployment and is used for application deployment.

The app deployment identity receives only resource-group-scoped permissions on `rg-traceops-prod`:

- Reader
- Website Contributor

After infrastructure deployment, the `appDeployClientId` output must be stored as the repository secret `AZURE_CLIENT_ID`.

Pull requests:

```text
npm install
npm run build
npm test
az bicep build
az deployment sub what-if
```

Main branch:

```text
deploy app deployment identity and workload infrastructure
deploy Azure Functions API
```

GitHub Actions use Azure OIDC. Publish profiles are not used.
