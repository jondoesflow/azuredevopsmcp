import { PublicClientApplication } from '@azure/msal-browser'
import { env, requireEnv } from '../config'

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: requireEnv(env.aadClientId, 'VITE_AAD_CLIENT_ID'),
    authority: `https://login.microsoftonline.com/${requireEnv(env.aadTenantId, 'VITE_AAD_TENANT_ID')}`,
    redirectUri: env.aadRedirectUri,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
})
