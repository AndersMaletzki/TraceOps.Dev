# AGENTS.md — Project Setup Checklist

---

## Project Summary

TraceOps.Dev is an AI-native issue, feature, and audit tracking platform designed for AI agents and repository operations workflows.

The system acts as:

- Persistent workflow state
- Issue tracking
- Feature tracking
- Audit finding tracking
- Coordination layer for AI agents

TraceOps.Dev is **not**:

- A Git hosting platform
- A CI/CD platform
- A PR automation system
- An autonomous coding system

---
## Architecture

- If present read docs/architecture.md

## Repository Rules

- This repository is a monorepo.
- Application code and infrastructure live in the same repository.
- Azure infrastructure must be written in Bicep.
- GitHub Actions is used for CI/CD.
- Prefer GitHub OIDC and managed identities.
- No manual Azure portal configuration unless explicitly documented.


---

## Folder Structure

```text
src/      Application code
tests/    Automated tests
infra/    Azure Bicep infrastructure
docs/     Architecture and operational documentation
scripts/  Local helper scripts
```

---

## Infrastructure Rules


- Use `infra/github-identities/` for repository-owned GitHub OIDC identities.
- Use `infra/workload/` for workload-specific Azure resources.
- Use Bicep modules under `infra/workload/modules/`.
- Keep parameters in parameter files.
- Infrastructure deployments must support PR what-if validation, main branch deployment, and production approval gates.
- Infrastructure templates use `targetScope = 'subscription'`.

---

## GitHub Actions Rules

```text
.github/workflows/deploy-main.yml
.github/workflows/infrastructure.yml
.github/workflows/deploy-<workload>.yml
```

- `deploy-main.yml` orchestrates deployments.
- `infrastructure.yml` validates and deploys Azure infrastructure.
- `deploy-<workload>.yml` builds, tests, packages, and deploys the application.
- Infrastructure deploys before application code.

---

## Azure OIDC Identity Model

Two GitHub OIDC identities are always required:

- `infrastructure.yml` must use `AZURE_INFRA_CLIENT_ID`.
- `deploy-<workload>.yml` must use `AZURE_CLIENT_ID`.
- Do not collapse these identities into one.

| Secret | Source | Purpose |
|---|---|---|
| `AZURE_INFRA_CLIENT_ID` | `azure-bicep-configs` bootstrap | Infrastructure deployment only |
| `AZURE_CLIENT_ID` | This repo's infra deployment | Application deployment only |

## Azure Standards

Default regions:

- Primary: `westeurope`
- SQL: `northeurope`

Resource naming:

| Resource | Pattern |
|---|---|
| Resource Group | `rg-<app>-<env>` |
| Function App | `func-<app>-<env>-<suffix>` |
| Storage Account | `st<app><env><suffix>` |
| Key Vault | `kv-<app>-<env>-<suffix>` |

Do not deviate from this naming convention without documenting the reason.---

## Security Rules

- Use GitHub OIDC for Azure authentication.
- Use separate identities for infrastructure deployment and app deployment.
- Prefer managed identities for Azure resource access.
- Store secrets in GitHub Secrets or Azure Key Vault.
- Never hardcode secrets, API keys, or connection strings.

---

## Coding Standards

- Keep code simple and readable.
- Prefer explicit names.
- Add tests for important behavior.
- Keep configuration centralized.
- Avoid large unrelated refactors in feature branches.

---

## TraceOps Context

- repoId: `AndersMaletzki/TraceOps.Dev`

---

## What Codex Should Avoid

- Do not use Azure publish profiles.
- Do not bypass tests or validation.
- Do not change deployment architecture without explaining why.
