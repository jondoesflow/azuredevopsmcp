export type DataverseRoleKey =
  | 'system_administrator'
  | 'passenger'
  | 'booking_officer'
  | 'hr_personel'

export type AuthzState = {
  loading: boolean
  error: string | null
  roles: DataverseRoleKey[]
}

export function canViewMyRequests(roles: DataverseRoleKey[]): boolean {
  return (
    roles.includes('system_administrator') ||
    roles.includes('booking_officer') ||
    roles.includes('hr_personel') ||
    roles.includes('passenger')
  )
}

export function canViewAllRequests(roles: DataverseRoleKey[]): boolean {
  return roles.includes('system_administrator') || roles.includes('booking_officer')
}

export function canApproveRequests(roles: DataverseRoleKey[]): boolean {
  return roles.includes('system_administrator') || roles.includes('booking_officer')
}

export function canBulkAddPassengers(roles: DataverseRoleKey[]): boolean {
  return roles.includes('system_administrator') || roles.includes('hr_personel')
}

export function canAccessAdmin(roles: DataverseRoleKey[]): boolean {
  return (
    roles.includes('system_administrator') ||
    roles.includes('booking_officer') ||
    roles.includes('hr_personel')
  )
}

export function canCreateRequest(roles: DataverseRoleKey[]): boolean {
  return (
    roles.includes('system_administrator') ||
    roles.includes('booking_officer') ||
    roles.includes('hr_personel') ||
    roles.includes('passenger')
  )
}
