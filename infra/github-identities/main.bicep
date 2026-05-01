extension 'br:mcr.microsoft.com/bicep/extensions/microsoftgraph/v1.0:1.0.0'

targetScope = 'subscription'

@description('Azure region for the workload resource group.')
param location string = 'westeurope'

@description('Resource group that contains the TraceOps workload.')
param resourceGroupName string = 'rg-traceops-prod'

@description('GitHub organization or user that owns the repository.')
param githubOwner string

@description('GitHub repository name.')
param repositoryName string

@description('Deployment environment name used in the Azure identity name.')
param environmentName string = 'production'

@description('Branch allowed to deploy production resources.')
param mainBranchName string = 'main'

var normalizedEnvironmentName = toLower(replace(environmentName, '_', '-'))
var appDeployName = 'github-traceops-app-deploy-${normalizedEnvironmentName}'
var githubIssuer = 'https://token.actions.githubusercontent.com'
var githubAudience = 'api://AzureADTokenExchange'

resource workloadResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
}

resource appDeploymentApplication 'Microsoft.Graph/applications@v1.0' = {
  uniqueName: appDeployName
  displayName: appDeployName
  signInAudience: 'AzureADMyOrg'

  resource mainBranchFederatedCredential 'federatedIdentityCredentials@v1.0' = {
    name: '${appDeployName}/github-main'
    description: 'GitHub Actions main branch app deployment for ${githubOwner}/${repositoryName}.'
    issuer: githubIssuer
    subject: 'repo:${githubOwner}/${repositoryName}:ref:refs/heads/${mainBranchName}'
    audiences: [
      githubAudience
    ]
  }
}

resource appDeploymentServicePrincipal 'Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: appDeploymentApplication.appId
}

module appDeploymentRbac 'modules/app-deployment-rbac.bicep' = {
  name: 'traceops-app-deployment-rbac'
  scope: workloadResourceGroup
  params: {
    appDeploymentPrincipalId: appDeploymentServicePrincipal.id
  }
}

output appDeployClientId string = appDeploymentApplication.appId
output appDeployPrincipalObjectId string = appDeploymentServicePrincipal.id
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
output resourceGroup string = workloadResourceGroup.name
