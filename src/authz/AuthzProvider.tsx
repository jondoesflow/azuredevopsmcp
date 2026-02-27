import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { DataverseClient } from '../dataverse/dataverseClient'
import { env } from '../config'
import type { AuthzState, DataverseRoleKey } from './authz'
import { AuthzContext } from './authzContext'
import type { AuthzContextValue } from './authzContext'
import { clearExternalSession, getExternalSession, getRememberedExternalEmail } from '../auth/externalSession'
import { acquireDataverseAccessToken } from '../auth/dataverseToken'

export function AuthzProvider({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const accountHomeId = account?.homeAccountId
  const externalSessionRaw = sessionStorage.getItem('externalUserSession') ?? ''
  const externalSession = useMemo(() => getExternalSession(), [externalSessionRaw])
  const externalSessionEmail =
    externalSession?.email?.trim().toLowerCase() ?? getRememberedExternalEmail()

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => await acquireDataverseAccessToken(instance, acct),
    })
  }, [instance])

  const [state, setState] = useState<AuthzState>({
    loading: !!account,
    error: null,
    roles: [],
    isExternalUser: false,
    externalContactId: undefined,
    needsExternalOnboarding: false,
  })

  const lastLoadedKeyRef = useRef<string | undefined>(undefined)
  const [refreshCounter, setRefreshCounter] = useState(0)

  useEffect(() => {
    let cancelled = false

    function isExternalAccountContext(acct: AccountInfo | undefined): boolean {
      if (!acct) return false

      const tenantId = env.aadTenantId?.trim().toLowerCase()
      const homeTenantId = acct.homeAccountId?.split('.')[1]?.toLowerCase()
      if (tenantId && homeTenantId && homeTenantId !== tenantId) {
        return true
      }

      const environment = acct.environment?.toLowerCase() ?? ''
      if (environment.includes('ciamlogin.com')) {
        return true
      }

      const claims = (acct.idTokenClaims ?? {}) as Record<string, unknown>
      const tfp = typeof claims.tfp === 'string' ? claims.tfp.trim() : ''
      const acr = typeof claims.acr === 'string' ? claims.acr.trim() : ''
      return Boolean(tfp || acr)
    }

    function toNormalizedEmail(value: unknown): string {
      if (typeof value !== 'string') return ''
      const trimmed = value.trim().toLowerCase()
      return trimmed.includes('@') ? trimmed : ''
    }

    function findEmailLikeValue(value: unknown, depth = 0): string {
      if (depth > 5) return ''

      if (typeof value === 'string') return toNormalizedEmail(value)

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

    function getEmailFromAccount(acct: AccountInfo | undefined): string {
      if (!acct) return ''
      const claims = (acct.idTokenClaims ?? {}) as Record<string, unknown>
      const direct = (
        toNormalizedEmail(acct.username) ||
        toNormalizedEmail(claims.email) ||
        (Array.isArray(claims.emails) ? toNormalizedEmail(claims.emails[0]) : '') ||
        toNormalizedEmail(claims.preferred_username)
      )
      return direct || findEmailLikeValue(claims)
    }

    function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
      let timeoutId: number | undefined
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(() => reject(new Error('Role check timed out')), ms)
      })
      return Promise.race([p, timeout]).finally(() => {
        if (timeoutId) window.clearTimeout(timeoutId)
      }) as Promise<T>
    }

    async function load() {
      if (!accountHomeId && !externalSession) {
        setState({
          loading: false,
          error: null,
          roles: [],
          isExternalUser: false,
          externalContactId: undefined,
          needsExternalOnboarding: false,
        })
        return
      }

      const externalOnboardingApiBase = env.externalOnboardingApiBaseUrl.replace(/\/$/, '')
      const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
      const isExternalContext = isExternalAccountContext(acct)

      if (acct && !isExternalContext && externalSession) {
        clearExternalSession()
      }

      const resolveExternalByBackend = async (
        email: string,
      ): Promise<AuthzState> => {
        const url = `${externalOnboardingApiBase}/api/external-onboarding/contacts/by-email?email=${encodeURIComponent(email)}`
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(text || `External onboarding API lookup failed (${response.status})`)
        }

        const payload = (await response.json().catch(() => ({}))) as {
          exists?: boolean
          contact?: { id?: string }
        }

        if (payload.exists && payload.contact?.id) {
          return {
            loading: false,
            error: null,
            roles: ['passenger'],
            isExternalUser: true,
            externalContactId: payload.contact.id,
            needsExternalOnboarding: false,
          }
        }

        return {
          loading: false,
          error: null,
          roles: [],
          isExternalUser: true,
          externalContactId: undefined,
          needsExternalOnboarding: true,
        }
      }

      if (externalSessionEmail && (!acct || isExternalContext)) {
        const normalizedEmail = externalSessionEmail
        const externalLoadKey = `external:${normalizedEmail}:${refreshCounter}`
        if (lastLoadedKeyRef.current === externalLoadKey) {
          return
        }

        if (!normalizedEmail) {
          clearExternalSession()
          setState({
            loading: false,
            error: 'External session email was missing. Please sign in again.',
            roles: [],
            isExternalUser: false,
            externalContactId: undefined,
            needsExternalOnboarding: false,
          })
          return
        }

        setState((s) => ({ ...s, loading: true, error: null }))
        try {
          const backendState = await withTimeout(
            resolveExternalByBackend(normalizedEmail),
            15000,
          )
          if (cancelled) return
          lastLoadedKeyRef.current = externalLoadKey
          setState(backendState)
          return
        } catch (e) {
          if (cancelled) return
          lastLoadedKeyRef.current = undefined
          setState({
            loading: false,
            error: e instanceof Error ? e.message : 'Failed to resolve external session',
            roles: [],
            isExternalUser: true,
            externalContactId: undefined,
            needsExternalOnboarding: true,
          })
          return
        }
      }

      const currentLoadKey = `${accountHomeId ?? 'none'}:${refreshCounter}`
      if (lastLoadedKeyRef.current === currentLoadKey) {
        return
      }

      if (!acct) {
        setState({
          loading: false,
          error: 'No signed-in account available',
          roles: [],
          isExternalUser: false,
          externalContactId: undefined,
          needsExternalOnboarding: false,
        })
        return
      }

      const isExternalUser = isExternalContext

      const resolveExternalPassengerState = async (): Promise<AuthzState> => {
        const email = getEmailFromAccount(acct) || externalSessionEmail
        if (!email) {
          return {
            loading: false,
            error: 'External account email address not available in token claims.',
            roles: [],
            isExternalUser: true,
            externalContactId: undefined,
            needsExternalOnboarding: true,
          }
        }

        if (externalOnboardingApiBase) {
          try {
            return await withTimeout(
              resolveExternalByBackend(email),
              15000,
            )
          } catch {
            // Fall back to Dataverse delegated lookup below.
          }
        }

        const existingContact = await withTimeout(client.getExternalPassengerContactByEmail(acct, email), 15000)
        if (existingContact) {
          return {
            loading: false,
            error: null,
            roles: ['passenger'],
            isExternalUser: true,
            externalContactId: existingContact.id,
            needsExternalOnboarding: false,
          }
        }

        return {
          loading: false,
          error: null,
          roles: [],
          isExternalUser: true,
          externalContactId: undefined,
          needsExternalOnboarding: true,
        }
      }

      setState((s) => ({ ...s, loading: true, error: null }))

      try {
        const roles = await withTimeout(client.getCurrentUserRoles(acct), 15000)
        const systemAdminRoleId = env.systemAdministratorSecurityRoleId?.toLowerCase()
        const bookingOfficerRoleId = env.personaBookingOfficerSecurityRoleId?.toLowerCase()
        const authoriserRoleId = env.personaAuthoriserSecurityRoleId?.toLowerCase()
        const passengerRoleId = env.personaPassengerSecurityRoleId?.toLowerCase()
        const hrRoleId = env.personaHrPersonnelSecurityRoleId?.toLowerCase()

        const mapped = new Set<DataverseRoleKey>()
        for (const r of roles) {
          const id = r.roleid.toLowerCase()
          if (systemAdminRoleId && id === systemAdminRoleId) mapped.add('system_administrator')
          if (bookingOfficerRoleId && id === bookingOfficerRoleId) mapped.add('booking_officer')
          if (authoriserRoleId && id === authoriserRoleId) mapped.add('authoriser')
          if (passengerRoleId && id === passengerRoleId) mapped.add('passenger')
          if (hrRoleId && id === hrRoleId) mapped.add('hr_personel')
        }

        if (cancelled) return
        if (mapped.size > 0 || !isExternalUser) {
          lastLoadedKeyRef.current = currentLoadKey
          setState({
            loading: false,
            error: null,
            roles: [...mapped],
            isExternalUser,
            externalContactId: undefined,
            needsExternalOnboarding: false,
          })
          return
        }

        const externalState = await resolveExternalPassengerState()
        if (cancelled) return
        lastLoadedKeyRef.current = currentLoadKey
        setState(externalState)
      } catch (e) {
        if (cancelled) return
        try {
          if (isExternalUser) {
            const externalState = await resolveExternalPassengerState()
            if (cancelled) return
            lastLoadedKeyRef.current = currentLoadKey
            setState(externalState)
            return
          }
        } catch (externalError) {
          if (cancelled) return
          lastLoadedKeyRef.current = undefined
          setState({
            loading: false,
            error: externalError instanceof Error ? externalError.message : 'Failed to resolve external passenger onboarding state',
            roles: [],
            isExternalUser: true,
            externalContactId: undefined,
            needsExternalOnboarding: true,
          })
          return
        }

        lastLoadedKeyRef.current = undefined
        setState({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load user roles',
          roles: [],
          isExternalUser,
          externalContactId: undefined,
          needsExternalOnboarding: false,
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accountHomeId, externalSessionEmail, client, instance, accounts, refreshCounter])

  const value: AuthzContextValue = useMemo(() => {
    return {
      ...state,
      hasRole: (role) => state.roles.includes(role),
      refresh: () => setRefreshCounter((n) => n + 1),
    }
  }, [state])

  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>
}

