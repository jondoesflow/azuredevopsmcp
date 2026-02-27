import { PublicClientApplication } from '@azure/msal-browser'
import type { AccountInfo } from '@azure/msal-browser'
import { env, getKnownAuthorities, requireEnv } from '../config'
import { getRememberedExternalEmail, setExternalSession } from './externalSession'

let externalInstance: PublicClientApplication | null = null

function normalizeMsalAuthority(authority: string): string {
  const trimmed = authority.trim().replace(/\/+$/, '')
  return trimmed
    .replace(/\/oauth2\/v2\.0\/token$/i, '')
    .replace(/\/oauth2\/v2\.0\/authorize$/i, '')
    .replace(/\/v2\.0$/i, '')
}

function splitAuthorityAndPolicy(value: string | undefined): { authority?: string; policy?: string } {
  if (!value) return {}
  const trimmed = value.trim()
  if (!trimmed) return {}

  try {
    const parsed = new URL(trimmed)
    const segments = parsed.pathname.split('/').filter(Boolean)
    const queryPolicy = parsed.searchParams.get('p')?.trim() || ''

    if (segments.length >= 2) {
      return {
        authority: normalizeMsalAuthority(`${parsed.origin}/${segments[0]}`),
        policy: queryPolicy || decodeURIComponent(segments[segments.length - 1]).trim(),
      }
    }

    if (segments.length === 1) {
      return {
        authority: normalizeMsalAuthority(`${parsed.origin}/${segments[0]}`),
        policy: queryPolicy || undefined,
      }
    }

    return {
      authority: normalizeMsalAuthority(`${parsed.origin}`),
      policy: queryPolicy || undefined,
    }
  } catch {
    return { policy: trimmed }
  }
}

function getExternalSignInAuthorityAndPolicy(): { authority: string; policy?: string } {
  const requiredAuthority = requireEnv(env.aadExternalAuthority, 'VITE_AAD_EXTERNAL_AUTHORITY')
  const parsedAuthority = splitAuthorityAndPolicy(requiredAuthority)

  return {
    authority: parsedAuthority.authority ?? normalizeMsalAuthority(requiredAuthority),
    policy: parsedAuthority.policy,
  }
}

function getExternalSignUpAuthorityAndPolicy(): { authority: string; policy?: string } {
  const signIn = getExternalSignInAuthorityAndPolicy()
  const parsedSignup = splitAuthorityAndPolicy(env.aadExternalSignUpAuthority)

  return {
    authority: parsedSignup.authority ?? signIn.authority,
    policy: parsedSignup.policy || signIn.policy,
  }
}

function getEffectiveExternalAuthority(): string {
  return getExternalSignInAuthorityAndPolicy().authority
}

function getExternalMsalInstance(): PublicClientApplication {
  if (externalInstance) return externalInstance

  externalInstance = new PublicClientApplication({
    auth: {
      clientId: requireEnv(env.aadExternalClientId, 'VITE_AAD_EXTERNAL_CLIENT_ID'),
      authority: getEffectiveExternalAuthority(),
      redirectUri: env.aadRedirectUri,
      knownAuthorities: getKnownAuthorities(),
    },
    cache: {
      cacheLocation: env.aadCacheLocation === 'localStorage' ? 'localStorage' : 'sessionStorage',
    },
  })

  return externalInstance
}

function getExternalAuthorityFromAccount(account: AccountInfo): string | undefined {
  const baseAuthority = env.aadExternalAuthority
  if (!baseAuthority) return undefined

  let host = ''
  try {
    host = new URL(baseAuthority).host
  } catch {
    return undefined
  }

  const claims = (account.idTokenClaims ?? {}) as Record<string, unknown>
  const policy = typeof claims.tfp === 'string'
    ? claims.tfp.trim()
    : typeof claims.acr === 'string'
      ? claims.acr.trim()
      : ''
  const tenantSegment = policy || account.tenantId?.trim() || ''
  if (!tenantSegment) return undefined

  return normalizeMsalAuthority(`https://${host}/${tenantSegment}`)
}

function toNormalizedEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toLowerCase()
  return trimmed.includes('@') ? trimmed : ''
}

function getClaimValue(claims: Record<string, unknown>, key: string): string {
  const value = claims[key]
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

function decodeJwtPayload(token: string | undefined): Record<string, unknown> {
  if (!token) return {}
  const parts = token.split('.')
  if (parts.length < 2) return {}

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return {}
  }
}

function findEmailLikeValue(value: unknown, depth = 0): string {
  if (depth > 5) return ''

  if (typeof value === 'string') {
    return toNormalizedEmail(value)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEmailLikeValue(item, depth + 1)
      if (found) return found
    }
    return ''
  }

  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findEmailLikeValue(nested, depth + 1)
      if (found) return found
    }
  }

  return ''
}

function resolveEmail(result: { account?: { username?: string }; idTokenClaims?: object | null; idToken?: string }): string {
  const claims = (result.idTokenClaims ?? {}) as Record<string, unknown>
  const jwtClaims = decodeJwtPayload(result.idToken)

  const candidates = [
    result.account?.username,
    getClaimValue(claims, 'email'),
    getClaimValue(claims, 'emails'),
    getClaimValue(claims, 'preferred_username'),
    getClaimValue(claims, 'upn'),
    getClaimValue(claims, 'signInNames.emailAddress'),
    getClaimValue(claims, 'emailAddress'),
    getClaimValue(claims, 'signInName'),
    getClaimValue(claims, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'),
    getClaimValue(jwtClaims, 'email'),
    getClaimValue(jwtClaims, 'emails'),
    getClaimValue(jwtClaims, 'preferred_username'),
    getClaimValue(jwtClaims, 'upn'),
    getClaimValue(jwtClaims, 'emailAddress'),
    getClaimValue(jwtClaims, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'),
  ]

  for (const candidate of candidates) {
    const email = toNormalizedEmail(candidate)
    if (email) return email
  }

  const nestedClaimEmail = findEmailLikeValue(claims)
  if (nestedClaimEmail) return nestedClaimEmail

  const nestedJwtEmail = findEmailLikeValue(jwtClaims)
  if (nestedJwtEmail) return nestedJwtEmail

  return ''
}

function resolveNames(result: { account?: { name?: string | null }; idTokenClaims?: object | null }): {
  name?: string
  firstName?: string
  lastName?: string
} {
  const claims = (result.idTokenClaims ?? {}) as Record<string, unknown>
  const fullName = (result.account?.name || getClaimValue(claims, 'name')).trim() || undefined
  const firstName = (getClaimValue(claims, 'given_name') || '').trim() || undefined
  const lastName = (getClaimValue(claims, 'family_name') || '').trim() || undefined

  if (firstName || lastName) {
    return { name: fullName, firstName, lastName }
  }

  if (fullName) {
    const parts = fullName.split(' ').filter(Boolean)
    if (parts.length > 1) {
      return {
        name: fullName,
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts.slice(-1).join(' '),
      }
    }
  }

  return { name: fullName }
}

export async function loginExternalWithPopup(): Promise<void> {
  const instance = getExternalMsalInstance()
  await instance.initialize()
  const popupRedirectUri = `${window.location.origin}/auth-popup.html`
  const { authority, policy } = getExternalSignUpAuthorityAndPolicy()
  const extraQueryParameters: Record<string, string> = {
    screen_hint: 'signup',
  }
  if (policy) extraQueryParameters.p = policy

  const result = await instance.loginPopup({
    scopes: ['openid', 'profile', 'email'],
    authority,
    redirectUri: popupRedirectUri,
    prompt: 'login',
    extraQueryParameters,
  })

  const email = resolveEmail(result)
  const names = resolveNames(result)

  if (!email) {
    throw new Error('External sign-in succeeded but no email claim was returned.')
  }

  setExternalSession({ email, ...names })
}

export async function loginExternalWithRedirect(): Promise<void> {
  return loginExternalSignUpWithRedirect()
}

export async function loginExternalSignUpWithRedirect(): Promise<void> {
  const instance = getExternalMsalInstance()
  await instance.initialize()
  const { authority, policy } = getExternalSignUpAuthorityAndPolicy()
  const extraQueryParameters: Record<string, string> = {
    screen_hint: 'signup',
  }
  if (policy) extraQueryParameters.p = policy

  await instance.loginRedirect({
    scopes: ['openid', 'profile', 'email'],
    authority,
    redirectUri: env.aadRedirectUri,
    prompt: 'login',
    extraQueryParameters,
  })
}

export async function loginExternalSignInWithRedirect(): Promise<void> {
  const instance = getExternalMsalInstance()
  await instance.initialize()
  const rememberedEmail = getRememberedExternalEmail()
  const { authority, policy } = getExternalSignInAuthorityAndPolicy()
  const extraQueryParameters: Record<string, string> = {}
  if (policy) extraQueryParameters.p = policy

  await instance.loginRedirect({
    scopes: ['openid', 'profile', 'email'],
    authority,
    redirectUri: env.aadRedirectUri,
    prompt: 'login',
    loginHint: rememberedEmail || undefined,
    extraQueryParameters,
  })
}

export async function handleExternalRedirectResult(): Promise<boolean> {
  const instance = getExternalMsalInstance()
  await instance.initialize()

  const result = await instance.handleRedirectPromise()
  if (!result) return false

  const email = resolveEmail(result) || getRememberedExternalEmail()
  const names = resolveNames(result)

  if (!email) {
    return false
  }

  setExternalSession({ email, ...names })
  return true
}

export async function acquireExternalDataverseAccessToken(): Promise<string> {
  const instance = getExternalMsalInstance()
  await instance.initialize()

  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0]
  if (!account) {
    throw new Error('External sign-in session not found. Please sign in again.')
  }

  if (!instance.getActiveAccount()) {
    instance.setActiveAccount(account)
  }

  const authority = getExternalAuthorityFromAccount(account)
  try {
    const result = await instance.acquireTokenSilent({
      account,
      scopes: [env.dataverseScope],
      authority,
    })
    return result.accessToken
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('authority_mismatch')) throw error

    const fallbackResult = await instance.acquireTokenSilent({
      account,
      scopes: [env.dataverseScope],
      authority: getEffectiveExternalAuthority(),
    })
    return fallbackResult.accessToken
  }
}
