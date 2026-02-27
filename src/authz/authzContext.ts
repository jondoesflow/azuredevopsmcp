import { createContext } from 'react'
import type { AuthzState, DataverseRoleKey } from './authz'

export type AuthzContextValue = AuthzState & {
  hasRole: (role: DataverseRoleKey) => boolean
  refresh: () => void
}

export const AuthzContext = createContext<AuthzContextValue | null>(null)
