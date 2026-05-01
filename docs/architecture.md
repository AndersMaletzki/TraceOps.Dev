# Architecture

This document describes the technical architecture of TraceOps.Dev.

---

## Project Purpose

TraceOps.Dev is an AI-native issue, feature, and audit tracking platform designed for AI agents and repository operations workflows. It provides persistent workflow state and a coordination layer for agent-driven repository work.

---

## High-Level Architecture

```text
User / Agent
  -> API (TypeScript on Azure Functions)
  -> Storage (Azure Table Storage)
  -> Observability (Azure Monitor / Application Insights)

Agent Integrations
  -> MCP Server (TypeScript)
  -> API
```

---

## Main Components

| Component | Technology | Purpose |
|---|---|---|
| API Backend | TypeScript + Azure Functions | Handles business logic, validation, and data access |
| Storage | Azure Table Storage | Persists issues, features, findings, and workflow state |
| MCP Server | TypeScript | Exposes agent-friendly interfaces for repository operations workflows |
| Infrastructure | Bicep | Defines and deploys Azure resources as code |
| Scripts | PowerShell + Bash | Supports local/dev/ops automation tasks |
| Documentation | Markdown | Captures architecture, operations, and design decisions |

---

## Azure Resources

| Resource | Purpose |
|---|---|
| Resource Group | Logical container for all TraceOps.Dev resources |
| Function App | Hosts the TypeScript Azure Functions API |
| Storage Account (Table) | Stores application entities and workflow state |
| Application Insights | Collects telemetry and application diagnostics |
| Log Analytics Workspace | Centralized log storage and querying |

---

## Data Model

Core entities include:

```text
Issue
Feature
AuditFinding
WorkflowState
AgentRun
RepositoryReference
```

---

## Request / Data Flow

```text
Client or Agent
  -> HTTP-triggered Azure Function
  -> Validation + domain logic
  -> Azure Table Storage read/write
  -> Response payload

Agent Tooling
  -> TypeScript MCP server
  -> API endpoints
  -> Storage-backed state and tracking
```

---

## Deployment Flow

```text
Pull Request:
  - install dependencies
  - build
  - test
  - Bicep build
  - Azure what-if

Main:
  - deploy infrastructure
  - deploy application
```

---

## Security Model

- GitHub OIDC is used for Azure authentication from CI/CD.
- Infrastructure and application deployment identities should be separated.
- Managed identities are preferred for Azure resource access.
- Secrets should be stored in GitHub Secrets and/or Azure Key Vault.
- API authentication and RBAC assignments should be explicitly defined as endpoints are introduced.

---

## Environments

| Environment | Purpose |
|---|---|
| dev | Development and validation environment |
| prod | Production environment |

---

## Important Decisions

```text
Decision: Use TypeScript + Azure Functions for backend/API.
Reason: Fast serverless iteration and strong TypeScript ecosystem.
Tradeoff: Function execution model and cold start considerations.

Decision: Use Azure Table Storage for initial persistence.
Reason: Low operational overhead, low cost, and simple entity-based storage.
Tradeoff: Limited relational/query flexibility compared to SQL databases.

Decision: Expose agent integration via a TypeScript MCP server.
Reason: Enables structured, tool-oriented interactions for AI agents.
Tradeoff: Requires careful contract/version management between MCP tools and API.
```

---

## Open Questions

- What authentication model should external/non-CI clients use for API access?
- Which retention policy should be applied to workflow state and audit history?
- Should long-term analytics remain in Table Storage or be projected to another store?
