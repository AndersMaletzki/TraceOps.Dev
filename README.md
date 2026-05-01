# TraceOps.Dev

TraceOps.Dev v0.1 is a minimal AI-native issue, feature, audit finding, and workflow state tracker for repository operations.

It proves one workflow:

```text
audit finding or feature request
-> create_workitem
-> search_workitems
-> get_next_workitem
-> claim_workitem
-> update_workitem_status
-> update_workitem_links
```

v0.1 does not create branches, push commits, open PRs, modify repositories, implement billing, notifications, dashboards, GitHub Apps, or advanced auth.

## Structure

```text
api/              Azure Functions HTTP API
mcp-server/       MCP stdio server that calls the API
infra/            Azure Bicep infrastructure
scripts/examples/ Example work item payloads
docs/             Architecture docs
```

## Requirements

- Node.js 20+
- Azure Functions Core Tools v4
- Azurite for local Table Storage, or an Azure Storage connection string
- Azure CLI for Bicep validation/deployment

## Environment

API:

```bash
export TRACEOPS_API_KEY='local-dev-key'
export TRACEOPS_STORAGE_CONNECTION_STRING='UseDevelopmentStorage=true'
export TRACEOPS_TABLE_WORKITEMS='WorkItems'
export TRACEOPS_TABLE_WORKITEM_EVENTS='WorkItemEvents'
```

MCP server:

```bash
export TRACEOPS_API_BASE_URL='http://localhost:7071/api'
export TRACEOPS_API_KEY='local-dev-key'
```

## Local Setup

```bash
npm install
npm run build
npm test
cp api/local.settings.sample.json api/local.settings.json
npm run dev:api
```

Run the MCP server after the API is available:

```bash
npm run dev:mcp
```

## API Examples

Create a work item:

```bash
curl -sS -X POST 'http://localhost:7071/api/workitems' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data @scripts/examples/create-security-issue.json
```

Search work items:

```bash
curl -sS 'http://localhost:7071/api/workitems?tenantId=demo-tenant&repoId=traceops-dev&limit=10' \
  -H 'x-api-key: local-dev-key'
```

Get the next actionable item:

```bash
curl -sS 'http://localhost:7071/api/workitems/next?tenantId=demo-tenant&repoId=traceops-dev' \
  -H 'x-api-key: local-dev-key'
```

Claim an item:

```bash
curl -sS -X PATCH 'http://localhost:7071/api/workitems/ITEM%2320260501153000%23abc123def0/claim' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data @scripts/examples/claim-workitem.json
```

Update status:

```bash
curl -sS -X PATCH 'http://localhost:7071/api/workitems/ITEM%2320260501153000%23abc123def0/status' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data '{"tenantId":"demo-tenant","repoId":"traceops-dev","status":"InProgress","actor":"codex"}'
```

Store external metadata:

```bash
curl -sS -X PATCH 'http://localhost:7071/api/workitems/ITEM%2320260501153000%23abc123def0/links' \
  -H 'content-type: application/json' \
  -H 'x-api-key: local-dev-key' \
  --data @scripts/examples/update-links.json
```

The `externalBranchName`, `externalCommitUrl`, and `externalPrUrl` fields are metadata only. TraceOps.Dev v0.1 never performs git operations.

## MCP Usage

Example Codex/Claude MCP config:

```json
{
  "mcpServers": {
    "traceops-dev": {
      "command": "node",
      "args": ["/absolute/path/to/TraceOps.Dev/mcp-server/dist/server.js"],
      "env": {
        "TRACEOPS_API_BASE_URL": "http://localhost:7071/api",
        "TRACEOPS_API_KEY": "local-dev-key"
      }
    }
  }
}
```

Available tools:

- `create_workitem`
- `search_workitems`
- `get_workitem`
- `get_next_workitem`
- `update_workitem_status`
- `claim_workitem`
- `update_workitem_links`

Tool responses are intentionally concise. All tools require `tenantId` and `repoId`.

## Infrastructure

Validate Bicep:

```bash
az bicep build --file infra/github-identities/main.bicep
az bicep build --file infra/workload/main.bicep
```

TraceOps.Dev uses two GitHub OIDC identities:

- `AZURE_INFRA_CLIENT_ID` is the app registration provisioned by the `azure-bicep-configs` bootstrap. It has subscription-level permissions and deploys infrastructure.
- `AZURE_CLIENT_ID` is the app registration provisioned by this monorepo's infrastructure deployment. It is used only for application deployment and receives Reader plus Website Contributor on `rg-traceops-prod`.

After the infrastructure deployment creates the app deployment identity, store the `appDeployClientId` output as the repository secret `AZURE_CLIENT_ID`.

Deploy through GitHub Actions using OIDC. Required repository secrets:

- `AZURE_INFRA_CLIENT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`
- `TRACEOPS_API_KEY`

The workload Bicep creates:

- app deployment app registration and service principal
- resource group
- Azure Storage account
- `WorkItems` table
- `WorkItemEvents` table
- Linux Azure Function App on Node 20
- Application Insights and Log Analytics

## Data Model

Work items are stored in Azure Table Storage:

```text
PartitionKey = TENANT#<tenantId>#REPO#<repoId>
RowKey       = ITEM#<yyyyMMddHHmmss>#<shortId>
```

Status events are append-only:

```text
PartitionKey = TENANT#<tenantId>#REPO#<repoId>
RowKey       = EVT#<yyyyMMddHHmmss>#<shortId>
```
