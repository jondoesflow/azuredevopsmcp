import type { AccountInfo, IPublicClientApplication } from '@azure/msal-browser'
import { env } from '../config'
import { acquireExternalDataverseAccessToken } from './externalMsal'

function isExternalAccountContext(account: AccountInfo): boolean {
  const internalTenantId = env.aadTenantId?.trim().toLowerCase()
  const homeTenantId = account.homeAccountId?.split('.')[1]?.toLowerCase()
  if (internalTenantId && homeTenantId && homeTenantId !== internalTenantId) {
    return true
  }

  const environment = account.environment?.toLowerCase() ?? ''
  return environment.includes('ciamlogin.com')
}

function hasExternalAuthConfigured(): boolean {
  return Boolean(env.aadExternalAuthority && env.aadExternalClientId)
}

export async function acquireDataverseAccessToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  const scope = env.dataverseScope

  if (isExternalAccountContext(account) && hasExternalAuthConfigured()) {
    return acquireExternalDataverseAccessToken()
  }

  try {
    const result = await instance.acquireTokenSilent({
      account,
      scopes: [scope],
    })
    return result.accessToken
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('authority_mismatch') && hasExternalAuthConfigured()) {
      return acquireExternalDataverseAccessToken()
    }
    throw error
  }
}