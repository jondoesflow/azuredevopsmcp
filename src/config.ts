export const env = {
  aadClientId: import.meta.env.VITE_AAD_CLIENT_ID as string | undefined,
  aadTenantId: import.meta.env.VITE_AAD_TENANT_ID as string | undefined,
  aadRedirectUri:
    (import.meta.env.VITE_AAD_REDIRECT_URI as string | undefined)?.trim() ||
    window.location.origin,
  personaBookingOfficerClientId: import.meta.env
    .VITE_PERSONA_BOOKING_OFFICER_CLIENT_ID as string | undefined,
  personaPassengerClientId: import.meta.env.VITE_PERSONA_PASSENGER_CLIENT_ID as
    | string
    | undefined,
  personaHrPersonnelClientId: import.meta.env
    .VITE_PERSONA_HRPERSONNEL_CLIENT_ID as string | undefined,
  personaBookingOfficerSecurityRoleId: (import.meta.env
    .VITE_PERSONA_BOOKING_OFFICER_SECURITY_ROLE_ID as string | undefined)?.trim(),
  personaPassengerSecurityRoleId: (import.meta.env
    .VITE_PERSONA_PASSENGER_SECURITY_ROLE_ID as string | undefined)?.trim(),
  personaHrPersonnelSecurityRoleId: (import.meta.env
    .VITE_PERSONA_HRPERSONNEL_SECURITY_ROLE_ID as string | undefined)?.trim(),
  systemAdministratorSecurityRoleId: (import.meta.env
    .VITE_SYSTEM_ADMINISTRATOR_SECURITY_ROLE_ID as string | undefined)?.trim(),
  dataverseUrl: (import.meta.env.VITE_DATAVERSE_URL as string | undefined) ??
    'https://org48ab23b4.crm11.dynamics.com',
  dataverseSolutionPrefix: (import.meta.env.VITE_DATAVERSE_SOLUTION_PREFIX as string | undefined)?.trim() ?? 'jdr_',
  dataverseEntitySet: (import.meta.env.VITE_DATAVERSE_ENTITY_SET as string | undefined) ??
    'paxdetailses',
  dataverseEntitySetGroup: (import.meta.env.VITE_DATAVERSE_ENTITY_SET_GROUP as string | undefined) ??
    'paxgroups',
  documentTypeMapJson: (import.meta.env.VITE_DOCUMENT_TYPE_MAP_JSON as
    | string
    | undefined)?.trim(),
  transportRequestStatusMapJson: (import.meta.env.VITE_TRANSPORT_REQUEST_STATUS_JSON as
    | string
    | undefined)?.trim(),
  useMock: (import.meta.env.VITE_USE_MOCK as string | undefined) === 'true',

  // Dataverse View GUIDs
  viewGuidRejectedPassengerBookings: (import.meta.env
    .VITE_DATAVERSE_VIEW_GUID_REJECTED_PASSENGER_BOOKINGS as string | undefined)?.trim(),
  viewGuidMyPassengerBookings: (import.meta.env
    .VITE_DATAVERSE_VIEW_GUID_MY_PASSENGER_BOOKINGS as string | undefined)?.trim(),
  viewGuidQueuedPassengerBookings: (import.meta.env
    .VITE_DATAVERSE_VIEW_GUID_QUEDED_PASSENGER_BOOKINGS as string | undefined)?.trim(),
  viewGuidGroupedQueuedPassengerBookings: (import.meta.env
    .VITE_DATAVERSE_VIEW_GUID_GROUPED_QUEDED_PASSENGER_BOOKINGS as string | undefined)?.trim(),
}

export function getPrefixedEntitySet(entitySet: string): string {
  const prefix = env.dataverseSolutionPrefix.endsWith('_')
    ? env.dataverseSolutionPrefix
    : `${env.dataverseSolutionPrefix}_`
  return `${prefix}${entitySet}`
}

export function getPrefixedColumn(columnName: string): string {
  const prefix = env.dataverseSolutionPrefix.endsWith('_')
    ? env.dataverseSolutionPrefix
    : `${env.dataverseSolutionPrefix}_`
  return `${prefix}${columnName}`
}

export function requireEnv(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}
