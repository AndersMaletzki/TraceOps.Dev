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

TraceOps.Dev backend is the sole owner of the product backend surface. The existing Azure Function App owns:

- API endpoints and request validation
- users
- tenants
- tenant memberships
- work items
- admin endpoints
- API key handling
- product storage access
- tenant validation and tenant-scoped authorization
- diagnostics and metrics endpoints
- MCP integration contracts exposed by the bundled MCP server

TraceOps.Dev owns the product data required to run repository workflow tracking:

- `Users`
- `Tenants`
- `TenantMembers`
- `WorkItems`
- `WorkItemEvents`

The website, MCP server, and other clients integrate with TraceOps.Dev; they are not the source of truth for users, tenants, tenant membership, work item access, API keys, admin metrics, or workflow state.

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
- general-purpose tenant CRUD endpoints
- general-purpose tenant membership management endpoints

## API

Trusted backend-owned endpoints use `x-api-key`. `TRACEOPS_API_KEY` stores the lowercase SHA-256 hash of the raw trusted key, and the API hashes the incoming `x-api-key` value before comparing. Tenant-scoped work item endpoints require `Authorization: Bearer <personal-api-key>` so tenant access stays bound to backend-owned personal API key records rather than a raw global key.

```text
POST  /workitems
GET   /workitems
GET   /workitems/{workItemId}
GET   /workitems/next
PATCH /workitems/{workItemId}/status
PATCH /workitems/{workItemId}/claim
PATCH /workitems/{workItemId}/links
POST  /auth/sync-user
GET   /auth/personal-api-key-scopes
GET   /app/workitems
GET   /app/admin/metrics/users
GET   /app/admin/metrics/issues
GET   /app/admin/metrics/requests
GET   /app/admin/health
GET   /app/admin/diagnostics
```

## Website-Facing Contract Freeze

PR 5 freezes the current backend contract consumed by the website before migration. This freeze is documentation and test coverage only. It does not change route behavior, route ownership, storage ownership, or Azure topology.

Website-consumed backend routes currently owned by the existing Azure Function App:

| Route | Method | Trusted auth | Purpose |
|---|---|---|---|
| `/auth/sync-user` | `POST` | `x-api-key` | Sync trusted website identity into TraceOps product records |
| `/auth/personal-api-key-scopes` | `GET` | `x-api-key` | Read the backend-owned supported personal API key scope list |
| `/app/workitems` | `GET` | `x-api-key` + caller user header | Read website work items after backend tenant validation and active-tenant resolution |
| `/me/api-keys` | `POST` | `x-api-key` + caller user header | Create a tenant-scoped personal API key using backend-owned tenant resolution |
| `/me/api-keys` | `GET` | `x-api-key` + caller user header | List personal API key metadata using backend-owned tenant resolution |
| `/me/api-keys/{apiKeyId}` | `DELETE` | `x-api-key` + caller user header | Revoke a personal API key using backend-owned tenant resolution |
| `/app/admin/metrics/users` | `GET` | `x-api-key` + caller user header | Read admin-only user metrics |
| `/app/admin/metrics/issues` | `GET` | `x-api-key` + caller user header | Read admin-only issue metrics |
| `/app/admin/metrics/requests` | `GET` | `x-api-key` + caller user header | Read admin-only request diagnostics metrics |
| `/app/admin/health` | `GET` | `x-api-key` + caller user header | Read admin-only backend health for existing runtime dependencies |
| `/app/admin/diagnostics` | `GET` | `x-api-key` + caller user header | Read admin-only backend diagnostics for existing runtime dependencies |

Current website-facing health and diagnostics scope:

- There is no dedicated public unauthenticated health route in the backend contract.
- Health and diagnostics are owned by the existing Azure Function App through admin-only routes.
- Operational health still exists through Azure Functions and Application Insights platform telemetry, and the backend now exposes additive admin-only contract routes that summarize that existing runtime wiring without introducing new resources.

`tenantId` and `repoId` are required for MCP-style repository work item operations so queries stay inside one Table Storage partition. The website-facing `GET /app/workitems` endpoint accepts optional `tenantId` and `repoId`. When `tenantId` is omitted, TraceOps.Dev resolves the caller's active tenant from backend-owned membership data and returns tenant-scoped `repositoryOptions` from API-owned work item data.

`POST /auth/sync-user` is a trusted backend integration endpoint for the website. The website backend derives the authenticated identity from Azure Static Web Apps auth headers and calls TraceOps with `x-api-key`; browser-provided identity is not trusted. The endpoint creates or updates the user, updates login metadata, stores `isAdmin` when roles contain `admin`, creates a personal tenant when missing, and ensures an owner tenant membership exists.

`GET /auth/personal-api-key-scopes` is a trusted backend integration endpoint for the website. The response is owned by TraceOps.Dev API and is the source of truth for which personal API key scopes are currently supported.

TraceOps.Dev-website is a thin server-side proxy. It sends `x-api-key` and, for app reads, `x-traceops-user-key` derived from trusted auth context. Browser code never receives `TRACEOPS_API_KEY` and never reads or writes product Table Storage directly. Product authorization belongs in TraceOps.Dev API; the website must not duplicate tenant membership validation as the source of truth.

`GET /app/workitems` validates the caller's tenant membership before returning tenant-scoped data. Its response includes `caller`, `activeTenant`, `repoId`, `repositoryOptions`, `items`, and `count`. `activeTenant` is resolved by the API when the trusted caller does not specify `tenantId`, and `repositoryOptions` are scoped to that active tenant.

Current tenant-management scope is intentionally limited to:

- syncing a trusted authenticated user into TraceOps product records
- ensuring a personal tenant exists for that user
- ensuring an `owner` membership exists for that personal tenant
- validating tenant membership before app-facing work item reads
- managing personal API keys inside a tenant context

The current backend does not expose public endpoints for arbitrary tenant creation, tenant updates, tenant deletion, tenant invites, tenant member removal, or tenant role administration beyond the membership data it maintains internally.

Admin metrics endpoints are backend-owned website contracts exposed by the existing Azure Function App. They require `x-api-key` and `x-traceops-user-key` for a stored TraceOps user with `isAdmin = true`. User and issue metrics aggregate from TraceOps-owned storage. Issue metrics count only `workItemType = Issue`. Request metrics query the existing Application Insights data in Log Analytics through the current backend wiring using `TRACEOPS_LOG_ANALYTICS_WORKSPACE_ID` and the Function App managed identity. This contract adds no new telemetry resources, routing, or identities.

- `GET /app/admin/metrics/users`: `totalUsers`, `githubUsers`, `microsoftUsers`, `adminUsers`, `usersCreatedLast7Days`, `activeUsersLast30Days`
- `GET /app/admin/metrics/issues`: `totalIssues`, `openIssues`, `fixedIssues`, `closedIssues`, `issuesCreatedLast7Days`
- `GET /app/admin/metrics/requests`: `requestsToday`, `requestsLast7Days`, `failedRequests`, `averageResponseDurationMs`

Admin health and diagnostics are also backend-owned website contracts exposed by the existing Azure Function App. These endpoints are additive and keep rollback simple because they only summarize the existing runtime dependencies already used by TraceOps.Dev:

- existing Azure Table Storage tables already used by the product backend
- existing Application Insights / Log Analytics request telemetry wiring
- existing runtime configuration already resolved into Function App settings, including production Key Vault references

They do not create or require API Management, Front Door, Container Apps, new identities, or new telemetry resources.

- `GET /app/admin/health`: `status`, `checkedAtUtc`, `storage`, `telemetry`, `runtimeConfig`
- `GET /app/admin/diagnostics`: `checkedAtUtc`, `health`, `requestMetrics`, `dependencies`

Frozen request and response shapes for website-facing routes:

- `POST /auth/sync-user`
  Request body: `identityProvider`, `providerUserId`, `userDetails`, optional `displayName`, required `roles`
  Response body: legacy top-level `user`, `personalTenant`, `memberships`, plus additive `bootstrap` with the same shape
- `GET /auth/personal-api-key-scopes`
  Response body: `supportedPersonalApiKeyScopes`
- `GET /app/workitems`
  Headers: canonical `x-traceops-user-key`; legacy `x-user-key` remains temporarily accepted for backward compatibility
  Query: optional `tenantId`, `repoId`, `status`, `severity`, `workItemType`, `category`, `limit`
  Response body: `caller`, `activeTenant`, `repoId`, `repositoryOptions`, `items`, `count`
- `POST /me/api-keys`
  Headers: `x-traceops-user-key`; optional `x-traceops-tenant-id`
  Request body: `name`, optional `scopes`, optional `expiresAtUtc`
  Response body: `apiKey`, `metadata`
- `GET /me/api-keys`
  Headers: `x-traceops-user-key`; optional `x-traceops-tenant-id`
  Response body: `items`
- `DELETE /me/api-keys/{apiKeyId}`
  Headers: `x-traceops-user-key`; optional `x-traceops-tenant-id`
  Response body: revoked API key metadata without `keyHash`
- `GET /app/admin/metrics/users`
  Response body: `totalUsers`, `githubUsers`, `microsoftUsers`, `adminUsers`, `usersCreatedLast7Days`, `activeUsersLast30Days`
- `GET /app/admin/metrics/issues`
  Response body: `totalIssues`, `openIssues`, `fixedIssues`, `closedIssues`, `issuesCreatedLast7Days`
- `GET /app/admin/metrics/requests`
  Response body: `requestsToday`, `requestsLast7Days`, `failedRequests`, `averageResponseDurationMs`
- `GET /app/admin/health`
  Response body: `status`, `checkedAtUtc`, `storage`, `telemetry`, `runtimeConfig`
- `GET /app/admin/diagnostics`
  Response body: `checkedAtUtc`, `health`, `requestMetrics`, `dependencies`

Website and backend integrations must use stable provider identity, represented by `identityProvider` + `providerUserId`. Email may be stored as user detail or display metadata, but integrations must not use email as the primary identity because emails can change and are not guaranteed to be unique across providers.

Browser clients must not be allowed to choose arbitrary tenant access. A trusted backend must derive the caller identity, and TraceOps.Dev must resolve or verify tenant membership before using any `tenantId` for app-facing reads or personal API key management.

Compatibility rules for the migration window:

- Additive response changes are allowed if existing fields keep the same meaning and type.
- Existing website-consumed routes, methods, and trusted header names must remain stable during the migration window.
- `x-traceops-user-key` is the canonical caller identity header. `x-user-key` is a temporary backward-compatibility alias and should be removed only in an explicit follow-up change after the website migration is complete.
- No behavior in this freeze changes tenant authorization, API key rules, or routing ownership.

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
- `TraceOpsApiKeys`

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

Supported taxonomy in the current backend is exactly the enum set implemented in the API and MCP contracts. Public docs should treat these values as the current supported scope, not as an open-ended taxonomy.

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

`TRACEOPS_API_KEY` and `TRACEOPS_API_KEY_HASH_SECRET` are not GitHub repository secrets in production. The Function App reads them from Key Vault references created by the workload deployment.

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
