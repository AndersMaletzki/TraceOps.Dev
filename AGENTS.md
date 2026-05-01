# AGENTS.md

This file contains project-specific instructions for Codex and other AI coding agents.

Fill this file out before asking Codex to build features.

---

## Project Summary

TODO: Describe what this project is.

Example:

This project is a SaaS application for tracking findings, issues, repositories, and technical debt.

---

## Repository Rules

Suggested rules:

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

Describe what each folder is responsible for.

Example:

```text
src/      Application code
tests/    Automated tests
infra/    Azure Bicep infrastructure
docs/     Architecture and operational documentation
scripts/  Local helper scripts
seed/     Optional seed/test data
```

---

## Infrastructure Rules

Suggested rules:

- Use `infra/github-identities/` for GitHub OIDC identities.
- Use `infra/workload/` for workload-specific Azure resources.
- Use Bicep modules under `infra/workload/modules/`.
- Keep parameters in parameter files.
- Infrastructure should support PR what-if and main deployment.
- Avoid manual Azure Portal configuration unless documented.

---

## GitHub Actions Rules

Suggested workflow files:

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

Suggested rules:

- Use GitHub OIDC for Azure authentication.
- Use separate identities for infrastructure deployment and app deployment.
- Prefer managed identities for Azure resource access.
- Store secrets in GitHub Secrets or Azure Key Vault.
- Never hardcode secrets, API keys, or connection strings.

---

## Coding Standards

Suggested rules:

- Keep code simple and readable.
- Prefer explicit names.
- Add tests for important behavior.
- Keep configuration centralized.
- Avoid large unrelated refactors in feature branches.

---

## What Codex Should Avoid

Suggested rules:

- Do not introduce Terraform.
- Do not use Azure publish profiles.
- Do not create Azure resources outside Bicep.
- Do not bypass tests or validation.
- Do not change deployment architecture without explaining why.
