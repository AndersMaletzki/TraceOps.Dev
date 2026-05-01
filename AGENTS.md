# AGENTS.md

This file contains project-specific instructions for Codex and other AI coding agents.

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

## Repository Rules

- This repository is a monorepo.
- Application code and infrastructure live in the same repository.
- Azure infrastructure must be written in Bicep.
- GitHub Actions is used for CI/CD.
- Pull requests validate and preview changes.
- Main branch deploys production changes.
- Do not commit secrets.
- Do not use publish profiles.
- Prefer GitHub OIDC and managed identities.

---

## Folder Structure

```text
.github/workflows/         CI/CD workflow definitions
infra/github-identities/   Azure identities and OIDC-related infrastructure
infra/workload/            Workload-specific Azure infrastructure (Bicep)
docs/                      Architecture and operational documentation
```

---

## Infrastructure Rules

- Use `infra/github-identities/` for GitHub OIDC identities.
- Use `infra/workload/` for workload-specific Azure resources.
- Use Bicep modules under `infra/workload/modules/` when the project grows.
- Keep parameters in parameter files.
- Infrastructure should support PR what-if and main deployment.
- Avoid manual Azure Portal configuration unless documented.

---

## GitHub Actions Rules

Expected workflow files:

```text
.github/workflows/deploy-main.yml
.github/workflows/infrastructure.yml
.github/workflows/deploy-app.yml
```

Expected behavior:

- `deploy-main.yml` orchestrates deployments.
- `infrastructure.yml` validates and deploys Azure infrastructure.
- `deploy-app.yml` builds, tests, packages, and deploys the application.
- Infrastructure deploys before application code.

---

## Security Rules

- Use GitHub OIDC for Azure authentication.
- Use separate app registrations for infrastructure deployment and app deployment.
- `AZURE_INFRA_CLIENT_ID` comes from `azure-bicep-configs` and is used only by infrastructure workflows.
- `AZURE_CLIENT_ID` comes from this repository's infrastructure deployment and is used only by app deployment workflows.
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

## What Codex Should Avoid

- Do not introduce Terraform.
- Do not use Azure publish profiles.
- Do not create Azure resources outside Bicep.
- Do not bypass tests or validation.
- Do not change deployment architecture without explaining why.
