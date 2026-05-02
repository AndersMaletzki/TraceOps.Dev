# Azure Functions Flex Consumption migration

TraceOps.Dev now deploys the API to Azure Functions Flex Consumption instead of classic Linux Consumption.

## What changed

- The workload Bicep creates a new Flex Consumption App Service plan with `FC1` / `FlexConsumption`.
- The workload Bicep creates a Linux Function App named with the existing pattern `func-traceops-<environment>-<suffix>`.
- Runtime configuration moved from `linuxFxVersion`, `FUNCTIONS_WORKER_RUNTIME`, and `FUNCTIONS_EXTENSION_VERSION` to `properties.functionAppConfig.runtime`.
- Scale configuration is set in `properties.functionAppConfig.scaleAndConcurrency` with the lowest Flex Consumption instance memory, 512 MB, and a conservative maximum instance count of 20.
- A blob deployment container is created in the existing TraceOps storage account for Flex Consumption One Deploy packages.
- `WEBSITE_RUN_FROM_PACKAGE` is no longer configured because Flex Consumption uses One Deploy.
- The Function App keeps a system-assigned managed identity.
- The app deployment service principal gets Website Contributor at the Function App scope for package deployment.
- Existing TraceOps tables and the existing TraceOps storage account are preserved.

## Cutover steps

1. Before deploying the Flex template, manually delete only the old classic Consumption Function App and old classic Consumption App Service plan in `rg-traceops-prod`.
2. Do not delete the TraceOps storage account, `WorkItems` table, or `WorkItemEvents` table.
3. Merge the infrastructure change to `main`.
4. Let `.github/workflows/deploy-main.yml` run. It calls the infrastructure workflow first, then deploys the API package to the Function App name output by infrastructure.
5. Confirm the recreated Function App exists in `rg-traceops-prod` and uses the Flex Consumption plan.
6. Deploy the API through the normal GitHub Actions app deployment path.
7. Validate API behavior against the `func-traceops-prod-*` hostname.

## Validation steps

- Run Bicep build for `infra/workload/main.bicep`.
- Run the repository Node build and tests.
- In GitHub Actions, confirm `deploy-main.yml` still runs `infrastructure` before `app`.
- On pull requests, confirm `.github/workflows/infrastructure.yml` runs Bicep build and what-if only.
- Confirm pull request validation does not pass `deploy: true` and does not deploy production resources.
- In Azure, confirm the new Function App has:
  - Hosting plan SKU `FC1` / `FlexConsumption`.
  - Runtime `node` version `20` under Flex application configuration.
  - Instance memory `512` MB under scale and concurrency.
  - App settings for `TRACEOPS_API_KEY` as a lowercase SHA-256 hash value, `TRACEOPS_STORAGE_CONNECTION_STRING`, `TRACEOPS_TABLE_WORKITEMS`, `TRACEOPS_TABLE_WORKITEM_EVENTS`, and `APPLICATIONINSIGHTS_CONNECTION_STRING`.
  - No `WEBSITE_RUN_FROM_PACKAGE`, `FUNCTIONS_WORKER_RUNTIME`, or `FUNCTIONS_EXTENSION_VERSION` app settings.
- Exercise the existing API routes and confirm records are read from and written to the existing TraceOps tables.

## Manual cleanup

Do not delete storage accounts or table resources unless data loss is intended.

Before deploying the Flex template, manually identify old classic Consumption resources in `rg-traceops-prod`:

- Function App with name `func-traceops-prod-*`.
- App Service plan with name `asp-traceops-prod-*`.
- App Service plan SKU `Y1` / `Dynamic`.

Delete only the old classic Consumption Function App and old classic Consumption App Service plan. Do not delete the TraceOps storage account, `WorkItems` table, or `WorkItemEvents` table unless deleting TraceOps data is intended.
