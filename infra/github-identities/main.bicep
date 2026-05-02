extension 'br:mcr.microsoft.com/bicep/extensions/microsoftgraph/v1.0:1.0.0' as graphV1

targetScope = 'subscription'

@description('GitHub organization or user that owns the repository.')
param githubOwner string

@description('GitHub repository name.')
param repositoryName string

@description('Deployment environment name used in the Azure identity name.')
param environmentName string = 'production'

@description('GitHub environment allowed to use the app deployment identity.')
param githubEnvironmentName string = 'production'

var normalizedEnvironmentName = toLower(replace(environmentName, '_', '-'))
var appDeployName = 'github-traceops-app-deploy-${normalizedEnvironmentName}'
var githubIssuer = 'https://token.actions.githubusercontent.com'
var githubAudience = 'api://AzureADTokenExchange'

resource appDeploymentApplication 'graphV1:Microsoft.Graph/applications@v1.0' = {
  uniqueName: appDeployName
  displayName: appDeployName
  signInAudience: 'AzureADMyOrg'

  resource productionEnvironmentFederatedCredential 'federatedIdentityCredentials@v1.0' = {
    name: '${appDeployName}/github-production'
    description: 'GitHub Actions production environment app deployment for ${githubOwner}/${repositoryName}.'
    issuer: githubIssuer
    subject: 'repo:${githubOwner}/${repositoryName}:environment:${githubEnvironmentName}'
    audiences: [
      githubAudience
    ]
  }
}

resource appDeploymentServicePrincipal 'graphV1:Microsoft.Graph/servicePrincipals@v1.0' = {
  appId: appDeploymentApplication.appId
}

output appDeployClientId string = appDeploymentApplication.appId
output appDeployPrincipalObjectId string = appDeploymentServicePrincipal.id
output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
