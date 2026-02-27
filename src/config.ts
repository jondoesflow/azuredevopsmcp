export const env = {
  aadClientId: import.meta.env.VITE_AAD_CLIENT_ID as string | undefined,
  aadTenantId: import.meta.env.VITE_AAD_TENANT_ID as string | undefined,
  aadExternalClientId: import.meta.env.VITE_AAD_EXTERNAL_CLIENT_ID as string | undefined,
  aadExternalAuthority: (import.meta.env.VITE_AAD_EXTERNAL_AUTHORITY as string | undefined)?.trim(),
  aadExternalSignUpAuthority: (import.meta.env.VITE_AAD_EXTERNAL_SIGNUP_AUTHORITY as string | undefined)?.trim(),
  aadKnownAuthoritiesCsv: (import.meta.env.VITE_AAD_KNOWN_AUTHORITIES as string | undefined)?.trim(),
  externalOnboardingApiBaseUrl:
    (import.meta.env.VITE_EXTERNAL_ONBOARDING_API_BASE_URL as string | undefined)?.trim() ?? '',
  aadRedirectUri:
    (import.meta.env.VITE_AAD_REDIRECT_URI as string | undefined)?.trim() ||
    window.location.origin,
  aadCacheLocation:
    (import.meta.env.VITE_AAD_CACHE_LOCATION as string | undefined)?.trim() ||
    'sessionStorage',
  personaBookingOfficerClientId: import.meta.env
    .VITE_PERSONA_BOOKING_OFFICER_CLIENT_ID as string | undefined,
  personaPassengerClientId: import.meta.env.VITE_PERSONA_PASSENGER_CLIENT_ID as
    | string
    | undefined,
  personaHrPersonnelClientId: import.meta.env
    .VITE_PERSONA_HRPERSONNEL_CLIENT_ID as string | undefined,
  personaAuthoriserClientId: import.meta.env
    .VITE_PERSONA_AUTHORISER_CLIENT_ID as string | undefined,
  personaBookingOfficerSecurityRoleId: (import.meta.env
    .VITE_PERSONA_BOOKING_OFFICER_SECURITY_ROLE_ID as string | undefined)?.trim(),
  personaPassengerSecurityRoleId: (import.meta.env
    .VITE_PERSONA_PASSENGER_SECURITY_ROLE_ID as string | undefined)?.trim(),
  personaHrPersonnelSecurityRoleId: (import.meta.env
    .VITE_PERSONA_HRPERSONNEL_SECURITY_ROLE_ID as string | undefined)?.trim(),
  personaAuthoriserSecurityRoleId: (import.meta.env
    .VITE_PERSONA_AUTHORISER_SECURITY_ROLE_ID as string | undefined)?.trim(),
  systemAdministratorSecurityRoleId: (import.meta.env
    .VITE_SYSTEM_ADMINISTRATOR_SECURITY_ROLE_ID as string | undefined)?.trim(),
  dataverseUrl: (import.meta.env.VITE_DATAVERSE_URL as string | undefined) ??
    'https://org48ab23b4.crm11.dynamics.com',
  dataverseScope:
    `${((import.meta.env.VITE_DATAVERSE_URL as string | undefined) ?? 'https://org48ab23b4.crm11.dynamics.com').replace(/\/$/, '')}/user_impersonation`,
  dataverseSolutionPrefix: (import.meta.env.VITE_DATAVERSE_SOLUTION_PREFIX as string | undefined)?.trim() ?? 'jdr_',
  dataverseEntitySet: (import.meta.env.VITE_DATAVERSE_ENTITY_SET as string | undefined) ??
    'paxdetailses',
  dataverseEntitySetGroup: (import.meta.env.VITE_DATAVERSE_ENTITY_SET_GROUP as string | undefined) ??
    'paxgroups',
  dataverseEntitySetAuthoriser: (import.meta.env.VITE_DATAVERSE_ENTITY_SET_AUTHORISER as string | undefined) ??
    'authorisers',
  documentTypeMapJson: (import.meta.env.VITE_DOCUMENT_TYPE_MAP_JSON as
    | string
    | undefined)?.trim(),
  milCivTypeMapJson: (import.meta.env.VITE_MILCIV_TYPE_MAP_JSON as
    | string
    | undefined)?.trim(),
  genderMapJson: (import.meta.env.VITE_GENDER_MAP_JSON as
    | string
    | undefined)?.trim(),
  transportRequestStatusMapJson: (import.meta.env.VITE_TRANSPORT_REQUEST_STATUS_JSON as
    | string
    | undefined)?.trim(),
  authorisationStatusMapJson: (import.meta.env.VITE_AUTHORISATION_STATUS_JSON as
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
  viewGuidPendingAuthPassengerBookings: (import.meta.env
    .VITE_DATAVERSE_VIEW_GUID_PENDING_AUTH_PASSENGER_BOOKINGS as string | undefined)?.trim(),
  viewGroupPendingAuthoriserApproval: (import.meta.env
    .VITE_DATAVERSE_VIEW_GROUP_PENDING_AUTHORISER_APPROVAL as string | undefined)?.trim(),
  viewPassengerPendingAuthoriserApproval: (import.meta.env
    .VITE_DATAVERSE_VIEW_PASSENGER_PENDING_AUTHORISER_APPROVAL as string | undefined)?.trim(),
  viewGroupApprovedByAuthoriser: (import.meta.env
    .VITE_DATAVERSE_VIEW_GROUP_APPROVED_BY_AUTHORISER as string | undefined)?.trim(),
  viewPassengerApprovedByAuthoriser: (import.meta.env
    .VITE_DATAVERSE_VIEW_PASSENGER_APPROVED_BY_AUTHORISER as string | undefined)?.trim(),
  viewGroupRejectedByBookingOfficer: (import.meta.env
    .VITE_DATAVERSE_VIEW_GROUP_REJECTED_BY_BOOKING_OFFICER as string | undefined)?.trim(),
  viewPassengerRejectedByBookingOfficer: (import.meta.env
    .VITE_DATAVERSE_VIEW_PASSENGER_REJECTED_BY_BOOKING_OFFICER as string | undefined)?.trim(),
  viewGroupReadyForAirCore: (import.meta.env
    .VITE_DATAVERSE_VIEW_GROUP_READY_FOR_AIRCORE as string | undefined)?.trim(),
  viewPassengerReadyForAirCore: (import.meta.env
    .VITE_DATAVERSE_VIEW_PASSENGER_READY_FOR_AIRCORE as string | undefined)?.trim(),
  viewActiveAuthorisers: (import.meta.env
    .VITE_DATAVERSE_VIEW_ACTIVE_AUTHORISERS as string | undefined)?.trim(),
}

export function getKnownAuthorities(): string[] {
  const hosts = new Set<string>()

  const csv = env.aadKnownAuthoritiesCsv
  if (csv) {
    for (const entry of csv.split(',')) {
      const host = entry.trim().toLowerCase()
      if (host) hosts.add(host)
    }
  }

  if (env.aadExternalAuthority) {
    try {
      const host = new URL(env.aadExternalAuthority).host.toLowerCase()
      if (host) hosts.add(host)
    } catch {
      // Ignore malformed authority; MSAL validation will surface a clear error if used.
    }
  }

  if (env.aadExternalSignUpAuthority) {
    try {
      const host = new URL(env.aadExternalSignUpAuthority).host.toLowerCase()
      if (host) hosts.add(host)
    } catch {
      // Ignore malformed authority; MSAL validation will surface a clear error if used.
    }
  }

  return [...hosts]
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
