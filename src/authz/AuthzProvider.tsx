import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { DataverseClient } from '../dataverse/dataverseClient'
import { env } from '../config'
import type { AuthzState, DataverseRoleKey } from './authz'

type AuthzContextValue = AuthzState & {
  hasRole: (role: DataverseRoleKey) => boolean
}

const AuthzContext = createContext<AuthzContextValue | null>(null)

export function AuthzProvider({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const accountHomeId = account?.homeAccountId

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => {
        const scope = `${env.dataverseUrl.replace(/\/$/, '')}/.default`
        const result = await instance.acquireTokenSilent({
          account: acct,
          scopes: [scope],
        })
        return result.accessToken
      },
    })
  }, [instance])

  const [state, setState] = useState<AuthzState>({
    loading: !!account,
    error: null,
    roles: [],
  })

  const lastLoadedHomeIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

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
      if (!accountHomeId) {
        setState({ loading: false, error: null, roles: [] })
        return
      }

      if (lastLoadedHomeIdRef.current === accountHomeId) {
        return
      }

      const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
      if (!acct) {
        setState({ loading: false, error: 'No signed-in account available', roles: [] })
        return
      }

      setState((s) => ({ ...s, loading: true, error: null }))

      try {
        const roles = await withTimeout(client.getCurrentUserRoles(acct), 15000)
        const systemAdminRoleId = env.systemAdministratorSecurityRoleId?.toLowerCase()
        const bookingOfficerRoleId = env.personaBookingOfficerSecurityRoleId?.toLowerCase()
        const passengerRoleId = env.personaPassengerSecurityRoleId?.toLowerCase()
        const hrRoleId = env.personaHrPersonnelSecurityRoleId?.toLowerCase()

        const mapped = new Set<DataverseRoleKey>()
        for (const r of roles) {
          const id = r.roleid.toLowerCase()
          if (systemAdminRoleId && id === systemAdminRoleId) mapped.add('system_administrator')
          if (bookingOfficerRoleId && id === bookingOfficerRoleId) mapped.add('booking_officer')
          if (passengerRoleId && id === passengerRoleId) mapped.add('passenger')
          if (hrRoleId && id === hrRoleId) mapped.add('hr_personel')
        }

        if (cancelled) return
        lastLoadedHomeIdRef.current = accountHomeId
        setState({ loading: false, error: null, roles: [...mapped] })
      } catch (e) {
        if (cancelled) return
        lastLoadedHomeIdRef.current = undefined
        setState({
          loading: false,
          error: e instanceof Error ? e.message : 'Failed to load user roles',
          roles: [],
        })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accountHomeId, client, instance, accounts])

  const value: AuthzContextValue = useMemo(() => {
    return {
      ...state,
      hasRole: (role) => state.roles.includes(role),
    }
  }, [state])

  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>
}

export function useAuthz(): AuthzContextValue {
  const ctx = useContext(AuthzContext)
  if (!ctx) throw new Error('useAuthz must be used within AuthzProvider')
  return ctx
}
