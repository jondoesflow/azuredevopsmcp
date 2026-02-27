import { PublicClientApplication } from '@azure/msal-browser'
import { env, getKnownAuthorities, requireEnv } from '../config'

const knownAuthorities = getKnownAuthorities()

export const msalInstance = new PublicClientApplication({
  auth: {
    clientId: requireEnv(env.aadClientId, 'VITE_AAD_CLIENT_ID'),
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: env.aadRedirectUri,
    knownAuthorities,
  },
  cache: {
    cacheLocation: env.aadCacheLocation === 'localStorage' ? 'localStorage' : 'sessionStorage',
  },
})
