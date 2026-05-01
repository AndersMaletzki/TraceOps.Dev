# Azure Monorepo Template

This repository is a starter template for new Azure-based application and website projects.

It is designed to follow the same working model as:

- `azure-bicep-configs` for bootstrap/platform infrastructure
- `JokesAPI` for product repositories where app code and infrastructure live together

The goal is to give every new project the same basic structure, documentation, Codex context, and deployment pattern.

---

## What To Do First In A New Project

After creating a new repository from this template, fill out these files first:

```text
AGENTS.md
docs/architecture.md
README.md
```

These files are the most important context files for Codex and for future maintenance.

---

## Required GitHub Setup

After creating a new repository from this template:

1. Create `production` GitHub environment
2. Add repository secrets
3. Add repository variables
4. Configure environment approvals if needed
5. Deploy bootstrap infrastructure

---

## Repository Structure

```text
.github/workflows/
  deploy-main.yml
  infrastructure.yml
  deploy-app.yml

docs/
  architecture.md
  deployment.md
  operations.md
  decisions/

infra/
  github-identities/
  workload/
    modules/
  scripts/

scripts/
src/
tests/
seed/
```

---

## AGENTS.md

`AGENTS.md` is the project-specific instruction file for Codex.

Fill it out before asking Codex to build features.

Use it to describe:

- what the project is
- how the repository is structured
- which rules Codex must follow
- how infrastructure should be managed
- how GitHub Actions should work
- which patterns Codex should reuse
- what Codex must avoid

Typical rules:

```text
This repository is a monorepo.
Application code and infrastructure live in the same repository.
Azure infrastructure must be written in Bicep.
GitHub Actions is used for CI/CD.
Pull requests validate and preview changes.
Main branch deploys production changes.
Use GitHub OIDC.
Prefer managed identities.
Never commit secrets.
Do not use publish profiles.
Do not introduce Terraform.
```

---

## docs/architecture.md

`docs/architecture.md` explains how the project works technically.

Fill it out with:

- project purpose
- main components
- Azure resources
- data model
- request/data flow
- deployment flow
- security model
- environments
- important decisions
- open questions

This file should be good enough that Codex can read it and understand the project direction before implementing anything.

---

## Recommended Codex Starter Prompt

Use this when opening a new Codex session:

```text
Read AGENTS.md and docs/architecture.md first.

This repository follows my standard Azure monorepo structure.

Before making changes:
1. Inspect the existing folder structure.
2. Reuse existing patterns.
3. Keep infrastructure in Bicep.
4. Keep app and infra deployable through GitHub Actions.
5. Do not introduce new architecture patterns unless needed.

Task:
<describe the task here>
```

---

## Setup Order For A New Project

```text
1. Create a new repository from this template.
2. Rename project-specific placeholders.
3. Fill out AGENTS.md.
4. Fill out docs/architecture.md.
5. Add the first app skeleton in src/.
6. Add Bicep infrastructure in infra/workload/.
7. Add GitHub identity setup in infra/github-identities/.
8. Add real GitHub Actions deployment steps.
9. Open the first PR.
```

---

## Template Notes

Empty folders contain `.gitkeep` files so GitHub keeps the structure.

The workflow and Bicep files are intentionally placeholders. They should be adapted for each project.
