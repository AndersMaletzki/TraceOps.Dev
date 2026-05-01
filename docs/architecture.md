# Architecture

This document describes the technical architecture of the project.

Fill this out before building major features.

---

## Project Purpose

TODO: What problem does this project solve?

Example:

This project provides a lightweight system for tracking findings, issues, repositories, and technical debt.

---

## High-Level Architecture

TODO: Describe the system at a high level.

Example:

```text
User
  -> Frontend
  -> API
  -> Storage/Database
  -> Azure observability
```

---

## Main Components

TODO: List the main components.

Example:

| Component | Purpose |
|---|---|
| Frontend | User interface |
| API | Business logic and data access |
| Storage | Persists application data |
| GitHub Actions | CI/CD |
| Azure Infrastructure | Hosting and observability |

---

## Azure Resources

TODO: List expected Azure resources.

Example:

| Resource | Purpose |
|---|---|
| Resource Group | Groups project resources |
| Function App | Hosts API |
| Storage Account | Runtime or application storage |
| Application Insights | Application monitoring |
| Log Analytics | Central log workspace |

---

## Data Model

TODO: Describe important entities.

Example:

```text
Issue
Repository
Finding
User
Project
```

---

## Request / Data Flow

TODO: Describe how data moves through the system.

Example:

```text
Client -> API endpoint -> validation -> storage -> response
```

---

## Deployment Flow

Expected pattern:

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

TODO: Describe authentication, authorization, identities, and secrets.

Suggested topics:

- GitHub OIDC
- Azure managed identities
- GitHub Secrets
- Azure Key Vault
- API authentication
- RBAC assignments

---

## Environments

TODO: Describe environments.

Example:

| Environment | Purpose |
|---|---|
| dev | Development/testing |
| prod | Production |

---

## Important Decisions

TODO: Document key design decisions.

Example:

```text
Decision: Use Azure Table Storage for v0.1.
Reason: Low cost, simple schema, easy to scale for early usage.
Tradeoff: Limited query flexibility compared to SQL.
```

---

## Open Questions

TODO: Track unresolved architecture questions.
