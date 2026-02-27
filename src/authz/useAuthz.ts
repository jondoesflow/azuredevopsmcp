import { useContext } from 'react'
import { AuthzContext } from './authzContext'
import type { AuthzContextValue } from './authzContext'

export function useAuthz(): AuthzContextValue {
  const ctx = useContext(AuthzContext)
  if (!ctx) throw new Error('useAuthz must be used within AuthzProvider')
  return ctx
}
