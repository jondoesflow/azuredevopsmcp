import type { AccountInfo } from '@azure/msal-browser'
import { env, getPrefixedEntitySet, getPrefixedColumn } from '../config'
import type { AuthorisationRecord, AuthoriserListItem, CreatePassengerRequestResult, CreatePaxGroupResult, ExternalPassengerContact, LookupOption, PassengerComment, PassengerRequest, PassengerRequestListItem, PaxGroupListItem } from './types'

type DataverseClientOptions = {
  getAccessToken: (account: AccountInfo) => Promise<string>
}

type WhoAmIResponse = {
  UserId: string
}

type ODataEntityId = {
  ['@odata.id']?: string
  ['@odata.etag']?: string
}

export type DataverseUserRole = {
  roleid: string
  name?: string
}

function toIsoDateTime(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time: ${value}`)
  return d.toISOString()
}

function getDocumentTypeValue(label: string): number {
  const raw = env.documentTypeMapJson
  if (!raw) {
    throw new Error(
      'Missing document type mapping. Set VITE_DOCUMENT_TYPE_MAP_JSON to map Choice labels to numeric values.',
    )
  }

  let map: Record<string, number>
  try {
    map = JSON.parse(raw) as Record<string, number>
  } catch {
    throw new Error('VITE_DOCUMENT_TYPE_MAP_JSON must be valid JSON')
  }

  const value = map[label]
  if (typeof value !== 'number') {
    throw new Error(
      `Unknown document type "${label}". Add it to VITE_DOCUMENT_TYPE_MAP_JSON.`,
    )
  }

  return value
}

function getMilCivTypeValue(label: string): number {
  const raw = env.milCivTypeMapJson
  if (!raw) {
    throw new Error(
      'Missing military/civilian mapping. Set VITE_MILCIV_TYPE_MAP_JSON to map labels to numeric values.',
    )
  }

  let map: Record<string, number>
  try {
    map = JSON.parse(raw) as Record<string, number>
  } catch {
    throw new Error('VITE_MILCIV_TYPE_MAP_JSON must be valid JSON')
  }

  const value = map[label]
  if (typeof value !== 'number') {
    throw new Error(
      `Unknown military/civilian type "${label}". Add it to VITE_MILCIV_TYPE_MAP_JSON.`,
    )
  }

  return value
}

function getGenderValue(label: string): number {
  const raw = env.genderMapJson
  if (!raw) {
    throw new Error(
      'Missing gender mapping. Set VITE_GENDER_MAP_JSON to map labels to numeric values.',
    )
  }

  let map: Record<string, number>
  try {
    map = JSON.parse(raw) as Record<string, number>
  } catch {
    throw new Error('VITE_GENDER_MAP_JSON must be valid JSON')
  }

  const value = map[label]
  if (typeof value !== 'number') {
    throw new Error(
      `Unknown gender "${label}". Add it to VITE_GENDER_MAP_JSON.`,
    )
  }

  return value
}

function toGuid(value: string | undefined): string | undefined {
  if (!value) return undefined
  const clean = value.replace(/[{}]/g, '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(clean)) return undefined
  return clean
}

function extractGuid(value: string | undefined): string | undefined {
  if (!value) return undefined
  const direct = toGuid(value)
  if (direct) return direct
  const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)
  return match?.[0]?.toLowerCase()
}

function guidFromODataId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const match = value.match(/\(([0-9a-f-]{36})\)$/i)
  return match?.[1]
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''")
}

function getTransportRequestStatusValue(label: string): number {
  const raw = env.transportRequestStatusMapJson
  if (!raw) {
    throw new Error(
      'Missing transport request status mapping. Set VITE_TRANSPORT_REQUEST_STATUS_JSON to map Choice labels to numeric values.',
    )
  }

  let map: Record<string, number>
  try {
    map = JSON.parse(raw) as Record<string, number>
  } catch {
    throw new Error('VITE_TRANSPORT_REQUEST_STATUS_JSON must be valid JSON')
  }

  const value = map[label]
  if (typeof value !== 'number') {
    throw new Error(
      `Unknown transport request status "${label}". Add it to VITE_TRANSPORT_REQUEST_STATUS_JSON.`,
    )
  }

  return value
}

function getTransportRequestStatusLabelFromValue(value: number | undefined): string | undefined {
  if (typeof value !== 'number') return undefined
  const raw = env.transportRequestStatusMapJson
  if (!raw) return undefined

  try {
    const map = JSON.parse(raw) as Record<string, number>
    const entry = Object.entries(map).find(([, v]) => v === value)
    return entry?.[0]
  } catch {
    return undefined
  }
}

function getAuthorisationStatusValue(label: string): number {
  const raw = env.authorisationStatusMapJson
  if (!raw) {
    throw new Error(
      'Missing authorisation status mapping. Set VITE_AUTHORISATION_STATUS_JSON to map Choice labels to numeric values.',
    )
  }

  let map: Record<string, number>
  try {
    map = JSON.parse(raw) as Record<string, number>
  } catch {
    throw new Error('VITE_AUTHORISATION_STATUS_JSON must be valid JSON')
  }

  const value = map[label]
  if (typeof value !== 'number') {
    throw new Error(
      `Unknown authorisation status "${label}". Add it to VITE_AUTHORISATION_STATUS_JSON.`,
    )
  }

  return value
}

function getAuthorisationStatusLabelFromValue(value: number | undefined): string | undefined {
  if (typeof value !== 'number') return undefined
  const raw = env.authorisationStatusMapJson
  if (!raw) return undefined

  try {
    const map = JSON.parse(raw) as Record<string, number>
    const entry = Object.entries(map).find(([, v]) => v === value)
    return entry?.[0]
  } catch {
    return undefined
  }
}

export class DataverseClient {
  private readonly getAccessToken: DataverseClientOptions['getAccessToken']

  constructor(opts: DataverseClientOptions) {
    this.getAccessToken = opts.getAccessToken
  }

  private getFullEntitySet(): string {
    return getPrefixedEntitySet(env.dataverseEntitySet)
  }

  private getFullEntitySetGroup(): string {
    return getPrefixedEntitySet(env.dataverseEntitySetGroup)
  }

  private col(name: string): string {
    return getPrefixedColumn(name)
  }

  private nav(name: string): string {
    const key = name.trim().toLowerCase()
    const map: Record<string, string> = {
      from: 'From',
      to: 'To',
      authoriser: 'Authoriser',
      authorisationreference: 'AuthorisationReference',
      authroisationreference: 'AuthroisationReference',
      nationality: 'Nationality',
      passportcountryofissue: 'PassportCountryofIssue',
      visacountryofissue: 'VisaCountryofIssue',
      purposeoftravel: 'PurposeofTravel',
      disability: 'Disability',
      mealdietary: 'MealDietary',
      group: 'Group',
      passengerbooking: 'PassengerBooking',
      purposeoftravelcode: 'PurposeofTravelCode',
      rankgrade: 'RankGrade',
      servicecode: 'ServiceCode',
      travelcode: 'TravelCode',
      bookingoffice: 'BookingOffice',
    }
    return getPrefixedColumn(map[key] ?? name)
  }

  private getPrimaryIdField(entitySet: string): string {
    const es = entitySet.trim()
    let logicalName = es
    if (/ies$/i.test(logicalName)) {
      logicalName = logicalName.replace(/ies$/i, 'y')
    } else if (/s$/i.test(logicalName)) {
      logicalName = logicalName.replace(/s$/i, '')
    }
    const singular = logicalName
    return `${singular}id`
  }

  private buildRecordUrl(base: string, entitySet: string, id: string): string {
    const guid = id.replace(/[{}]/g, '')
    return `${base}/api/data/v9.2/${entitySet}(${guid})`
  }

  private getLookupNameColumnCandidates(entitySetWithoutPrefix: string): string[] {
    const key = entitySetWithoutPrefix.trim().toLowerCase()
    if (key === 'countries') {
      return ['countrynamelong', 'country', 'name']
    }
    if (key === 'ranks') {
      return ['rankname', 'rankabbreviation', 'name']
    }
    if (key === 'servicecodes') {
      return ['servicecodename', 'servicecode', 'name']
    }
    if (key === 'travelcodes') {
      return ['name', 'travelcodename', 'travelcode']
    }
    if (key === 'purposeoftravels') {
      return ['name', 'purposeoftravelname']
    }
    if (key === 'authorisers') {
      return ['authorisername', 'name']
    }
    return ['name']
  }

  private async fetchJson<T>(account: AccountInfo, url: string): Promise<T> {
    const token = await this.getAccessToken(account)
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue"',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
    })

    const contentType = res.headers.get('content-type') ?? ''
    const bodyText = await res.text().catch(() => '')

    if (!res.ok) {
      const text = bodyText
      if (res.status === 403) {
        throw new Error(
          `Dataverse access denied (403). Your Dataverse security role may not allow this action. URL: ${url} ${text}`,
        )
      }
      throw new Error(
        `Dataverse request failed: ${res.status} ${res.statusText}. URL: ${url} ${text}`,
      )
    }

    if (!contentType.toLowerCase().includes('application/json')) {
      const snippet = bodyText.slice(0, 300)
      throw new Error(
        `Dataverse returned a non-JSON response. This often indicates an authentication redirect or an error page. URL: ${url} Content-Type: ${contentType} Body: ${snippet}`,
      )
    }

    try {
      return JSON.parse(bodyText) as T
    } catch {
      const snippet = bodyText.slice(0, 300)
      throw new Error(
        `Failed to parse Dataverse JSON response. URL: ${url} Content-Type: ${contentType} Body: ${snippet}`,
      )
    }
  }

  async listLookupOptions(account: AccountInfo, entitySetWithoutPrefix: string): Promise<LookupOption[]> {
    if (env.useMock) return []

    const base = env.dataverseUrl.replace(/\/$/, '')
    const fullEntitySet = getPrefixedEntitySet(entitySetWithoutPrefix)
    const idField = this.getPrimaryIdField(fullEntitySet)
    const nameCandidates = this.getLookupNameColumnCandidates(entitySetWithoutPrefix)
    let lastError: Error | null = null

    for (const logicalName of nameCandidates) {
      const nameCol = getPrefixedColumn(logicalName)
      const url =
        `${base}/api/data/v9.2/${fullEntitySet}` +
        `?$select=${idField},${nameCol}` +
        `&$top=5000`

      try {
        const res = await this.fetchJson<{ value?: Array<Record<string, unknown>> }>(account, url)
        const options = (res.value ?? [])
          .map((row) => {
            const rawId = row[idField]
            const odataId = row['@odata.id']
            const id = extractGuid(typeof rawId === 'string' ? rawId : typeof odataId === 'string' ? odataId : undefined)
            const name = row[nameCol]
            if (typeof id !== 'string' || typeof name !== 'string') return null
            return { id, name }
          })
          .filter((v): v is LookupOption => !!v)
        if (options.length > 0) return options
      } catch (e) {
        const err = e instanceof Error ? e : new Error('Failed to load lookup options')
        const isMissingProperty =
          err.message.includes('Could not find a property named') ||
          err.message.includes('does not exist on type') ||
          err.message.includes('Invalid property')
        if (!isMissingProperty) throw err
        lastError = err
      }
    }

    try {
      const fallbackUrl = `${base}/api/data/v9.2/${fullEntitySet}?$top=5000`
      const fallback = await this.fetchJson<{ value?: Array<Record<string, unknown>> }>(account, fallbackUrl)
      const options = (fallback.value ?? [])
        .map((row) => {
          const preferredNameCols = [
            ...nameCandidates.map((c) => getPrefixedColumn(c)),
            getPrefixedColumn('name'),
          ]

          const preferredName = preferredNameCols
            .map((col) => row[col])
            .find((v): v is string => typeof v === 'string' && v.trim().length > 0)

          const genericName = Object.entries(row)
            .find(([key, value]) => {
              if (typeof value !== 'string') return false
              const normalized = value.trim()
              if (!normalized) return false
              if (key.startsWith('@') || key.includes('@')) return false
              if (/id$/i.test(key)) return false
              if (/^[{(]?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[)}]?$/i.test(normalized)) {
                return false
              }
              return true
            })?.[1]

          const name = preferredName ?? genericName

          const rawId =
            row[idField] ??
            Object.entries(row).find(([key, value]) => /id$/i.test(key) && typeof value === 'string')?.[1]
          const odataId = row['@odata.id']
          const id = extractGuid(
            typeof rawId === 'string'
              ? rawId
              : typeof odataId === 'string'
                ? odataId
                : undefined,
          )
          if (typeof id !== 'string' || typeof name !== 'string') return null
          return { id, name }
        })
        .filter((v): v is LookupOption => !!v)

      if (options.length > 0) return options
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Failed to load lookup options')
      lastError = err
    }

    if (lastError) throw lastError
    throw new Error(`Failed to load lookup options for ${entitySetWithoutPrefix}.`)
  }

  async listTeamOptions(account: AccountInfo): Promise<LookupOption[]> {
    if (env.useMock) return []

    const base = env.dataverseUrl.replace(/\/$/, '')
    const url = `${base}/api/data/v9.2/teams?$select=teamid,name&$top=5000`
    const res = await this.fetchJson<{ value?: Array<Record<string, unknown>> }>(account, url)
    return (res.value ?? [])
      .map((row) => {
        const id = extractGuid(typeof row.teamid === 'string' ? row.teamid : undefined)
        const name = typeof row.name === 'string' ? row.name : undefined
        if (!id || !name) return null
        return { id, name }
      })
      .filter((v): v is LookupOption => !!v)
  }

  async listAuthorisersByView(account: AccountInfo, viewGuid: string): Promise<AuthoriserListItem[]> {
    if (env.useMock) return []

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = getPrefixedEntitySet(env.dataverseEntitySetAuthoriser)
    const idField = this.getPrimaryIdField(entitySet)
    const nameCol = this.col('authorisername')
    const emailCol = this.col('email')
    const bookingOfficeLookupCol = `_${this.col('bookingoffice')}_value`
    const bookingOfficeFormattedCol = `${bookingOfficeLookupCol}@OData.Community.Display.V1.FormattedValue`
    const cleanGuid = viewGuid.replace(/[{}]/g, '')
    const url = `${base}/api/data/v9.2/${entitySet}?savedQuery=${cleanGuid}`

    const res = await this.fetchJson<{ value?: Array<ODataEntityId & Record<string, unknown>> }>(account, url)
    return (res.value ?? []).map((row) => ({
      id: (row['@odata.id'] as string | undefined) ?? (row[idField] as string | undefined),
      odataId:
        (row['@odata.id'] as string | undefined) ??
        (row[idField] ? this.buildRecordUrl(base, entitySet, String(row[idField])) : undefined),
      etag: row['@odata.etag'],
      authoriserName: row[nameCol] as string | undefined,
      email: row[emailCol] as string | undefined,
      bookingOfficeId: row[bookingOfficeLookupCol] as string | undefined,
      bookingOfficeName: row[bookingOfficeFormattedCol] as string | undefined,
    }))
  }

  async updateAuthoriser(
    account: AccountInfo,
    item: Pick<AuthoriserListItem, 'odataId' | 'etag'>,
    patch: Partial<Pick<AuthoriserListItem, 'authoriserName' | 'email' | 'bookingOfficeId'>>,
  ): Promise<void> {
    if (env.useMock) return
    if (!item.odataId) throw new Error('Missing Dataverse authoriser record id (odataId)')

    const body: Record<string, unknown> = {}
    if (patch.authoriserName !== undefined) body[this.col('authorisername')] = patch.authoriserName
    if (patch.email !== undefined) body[this.col('email')] = patch.email
    if (patch.bookingOfficeId !== undefined) {
      const clean = toGuid(patch.bookingOfficeId)
      body[`${this.nav('bookingoffice')}@odata.bind`] = clean ? `/teams(${clean})` : null
    }

    const token = await this.getAccessToken(account)
    const res = await fetch(item.odataId, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-Match': item.etag ?? '*',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dataverse authoriser update failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  async createAuthoriser(
    account: AccountInfo,
    record: Pick<AuthoriserListItem, 'authoriserName' | 'email' | 'bookingOfficeId'>,
  ): Promise<void> {
    if (env.useMock) return

    const name = (record.authoriserName ?? '').trim()
    const email = (record.email ?? '').trim()
    const bookingOfficeId = toGuid(record.bookingOfficeId)

    if (!name) throw new Error('Authoriser name is required.')
    if (!email) throw new Error('Email address is required.')
    if (!bookingOfficeId) throw new Error('Booking Office is required.')

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = getPrefixedEntitySet(env.dataverseEntitySetAuthoriser)
    const token = await this.getAccessToken(account)
    const body: Record<string, unknown> = {
      [this.col('authorisername')]: name,
      [this.col('email')]: email,
      [`${this.nav('bookingoffice')}@odata.bind`]: `/teams(${bookingOfficeId})`,
    }

    const res = await fetch(`${base}/api/data/v9.2/${entitySet}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dataverse authoriser create failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  async deleteAuthoriser(
    account: AccountInfo,
    item: Pick<AuthoriserListItem, 'odataId' | 'etag' | 'email' | 'bookingOfficeId'>,
  ): Promise<void> {
    if (env.useMock) return
    if (!item.odataId) throw new Error('Missing Dataverse authoriser record id (odataId)')

    const bookingOfficeId = toGuid(item.bookingOfficeId)
    const email = (item.email ?? '').trim().toLowerCase()
    if (bookingOfficeId && email) {
      await this.removeSystemUserFromTeamByEmail(account, bookingOfficeId, email)
    }

    const token = await this.getAccessToken(account)
    const res = await fetch(item.odataId, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-Match': item.etag ?? '*',
      },
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dataverse authoriser delete failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  private async removeSystemUserFromTeamByEmail(
    account: AccountInfo,
    teamId: string,
    email: string,
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return

    const base = env.dataverseUrl.replace(/\/$/, '')
    const token = await this.getAccessToken(account)
    const filter = encodeURIComponent(
      `internalemailaddress eq '${escapeODataString(normalizedEmail)}' or domainname eq '${escapeODataString(normalizedEmail)}'`,
    )
    const select = encodeURIComponent('systemuserid')
    const findUrl = `${base}/api/data/v9.2/systemusers?$select=${select}&$filter=${filter}&$top=1`

    const userRes = await this.fetchJson<{ value?: Array<Record<string, unknown>> }>(account, findUrl)
    const userId = extractGuid(typeof userRes.value?.[0]?.systemuserid === 'string' ? userRes.value?.[0]?.systemuserid : undefined)
    if (!userId) return

    const cleanTeamId = toGuid(teamId)
    if (!cleanTeamId) return

    const removeUrl = `${base}/api/data/v9.2/teams(${cleanTeamId})/Microsoft.Dynamics.CRM.RemoveMembersTeam`
    const res = await fetch(removeUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body: JSON.stringify({ MemberIds: [userId] }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dataverse remove team member failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  async getWhoAmI(account: AccountInfo): Promise<WhoAmIResponse> {
    const base = env.dataverseUrl.replace(/\/$/, '')
    const url = `${base}/api/data/v9.2/WhoAmI()`
    return await this.fetchJson<WhoAmIResponse>(account, url)
  }

  async getCurrentUserRoleNames(account: AccountInfo): Promise<string[]> {
    if (env.useMock) return ['Passenger']

    const base = env.dataverseUrl.replace(/\/$/, '')
    const who = await this.getWhoAmI(account)

    // Standard relationship name in Dataverse for user->roles is systemuserroles_association.
    // We query role names to support role-based UI gating.
    const url = `${base}/api/data/v9.2/systemusers(${who.UserId})/systemuserroles_association?$select=name`
    const res = await this.fetchJson<{ value?: Array<{ name?: string }> }>(account, url)
    const names = (res.value ?? [])
      .map((v) => v.name)
      .filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    return names
  }

  async getCurrentUserRoles(account: AccountInfo): Promise<DataverseUserRole[]> {
    if (env.useMock) return [{ roleid: env.personaPassengerSecurityRoleId ?? 'mock', name: 'Passenger' }]

    const base = env.dataverseUrl.replace(/\/$/, '')
    const who = await this.getWhoAmI(account)
    const url = `${base}/api/data/v9.2/systemusers(${who.UserId})/systemuserroles_association?$select=roleid,name`
    const res = await this.fetchJson<{ value?: DataverseUserRole[] }>(account, url)
    return (res.value ?? []).filter((r) => typeof r.roleid === 'string' && r.roleid.length > 0)
  }

  async getExternalPassengerContactByEmail(
    account: AccountInfo,
    email: string,
  ): Promise<ExternalPassengerContact | null> {
    if (env.useMock) {
      const key = 'mockExternalPassengerContacts'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as ExternalPassengerContact[]
      const match = existing.find((item) => item.email.toLowerCase() === email.trim().toLowerCase())
      return match ?? null
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail) return null

    const base = env.dataverseUrl.replace(/\/$/, '')
    const filter = encodeURIComponent(`emailaddress1 eq '${escapeODataString(normalizedEmail)}'`)
    const select = encodeURIComponent('contactid,emailaddress1,firstname,lastname')
    const url = `${base}/api/data/v9.2/contacts?$select=${select}&$filter=${filter}&$top=1`

    const res = await this.fetchJson<{ value?: Array<ODataEntityId & Record<string, unknown>> }>(account, url)
    const row = (res.value ?? [])[0]
    if (!row) return null

    const id = extractGuid(typeof row.contactid === 'string' ? row.contactid : undefined)
    if (!id) return null

    return {
      id,
      odataId:
        (row['@odata.id'] as string | undefined) ??
        this.buildRecordUrl(base, 'contacts', id),
      etag: row['@odata.etag'],
      email: String(row.emailaddress1 ?? normalizedEmail),
      firstName: typeof row.firstname === 'string' ? row.firstname : undefined,
      lastName: typeof row.lastname === 'string' ? row.lastname : undefined,
    }
  }

  async createExternalPassengerContact(
    account: AccountInfo,
    payload: { email: string; firstName: string; lastName: string },
  ): Promise<ExternalPassengerContact> {
    const normalizedEmail = payload.email.trim().toLowerCase()
    const firstName = payload.firstName.trim()
    const lastName = payload.lastName.trim()

    if (!normalizedEmail) throw new Error('Email address is required.')
    if (!firstName) throw new Error('First name is required.')
    if (!lastName) throw new Error('Last name is required.')

    if (env.useMock) {
      const key = 'mockExternalPassengerContacts'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as ExternalPassengerContact[]
      const found = existing.find((item) => item.email.toLowerCase() === normalizedEmail)
      if (found) return found

      const created: ExternalPassengerContact = {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        firstName,
        lastName,
      }
      existing.push(created)
      localStorage.setItem(key, JSON.stringify(existing))
      return created
    }

    const token = await this.getAccessToken(account)
    const base = env.dataverseUrl.replace(/\/$/, '')
    const url = `${base}/api/data/v9.2/contacts`

    const body: Record<string, unknown> = {
      emailaddress1: normalizedEmail,
      firstname: firstName,
      lastname: lastName,
      [this.col('ispassenger')]: true,
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 403) {
        throw new Error('Dataverse denied Contact creation (403). Verify table permissions for external onboarding.')
      }
      throw new Error(`Dataverse contact create failed: ${res.status} ${res.statusText}. ${text}`)
    }

    const contentType = res.headers.get('content-type') ?? ''
    let responseBody: Record<string, unknown> = {}
    if (contentType.toLowerCase().includes('application/json')) {
      responseBody = (await res.json().catch(() => ({}))) as Record<string, unknown>
    }

    const id =
      extractGuid(typeof responseBody.contactid === 'string' ? responseBody.contactid : undefined) ??
      extractGuid(res.headers.get('OData-EntityId') ?? undefined)

    if (!id) throw new Error('Dataverse contact create succeeded but no contact id was returned.')

    return {
      id,
      odataId: this.buildRecordUrl(base, 'contacts', id),
      etag: (responseBody['@odata.etag'] as string | undefined) ?? undefined,
      email: String(responseBody.emailaddress1 ?? normalizedEmail),
      firstName: typeof responseBody.firstname === 'string' ? responseBody.firstname : firstName,
      lastName: typeof responseBody.lastname === 'string' ? responseBody.lastname : lastName,
    }
  }

  async createPassengerRequest(
    account: AccountInfo,
    request: PassengerRequest,
  ): Promise<CreatePassengerRequestResult> {
    if (env.useMock) {
      const id = crypto.randomUUID()
      const key = 'mockPassengerRequests'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<
        PassengerRequest & { id: string; createdAt: string; referenceName?: string }
      >
      // Generate a mock reference name similar to Dataverse auto-numbering
      const refNum = String(existing.length + 1).padStart(5, '0')
      const referenceName = `PAX-${refNum}`
      existing.unshift({
        ...request,
        transportRequestStatusLabel: request.transportRequestStatusLabel ?? 'Submitted',
        id,
        referenceName,
        createdAt: new Date().toISOString(),
      })
      localStorage.setItem(key, JSON.stringify(existing))
      return { id, referenceName }
    }

    const token = await this.getAccessToken(account)
    const entitySet = this.getFullEntitySet()
    const url = `${env.dataverseUrl.replace(/\/$/, '')}/api/data/v9.2/${entitySet}`

    const body: Record<string, unknown> = {
      [this.col('surname')]: request.surname,
      [this.col('forenames')]: request.forenames,
      [this.col('documenttype')]: getDocumentTypeValue(request.documentTypeLabel),
      [this.col('documentnumber')]: request.documentNumber,
      [this.col('departingon')]: toIsoDateTime(request.departingOn),
      [this.col('returningon')]: toIsoDateTime(request.returningOn),
      [this.col('transportrequeststatus')]: getTransportRequestStatusValue(
        request.transportRequestStatusLabel ?? 'Submitted',
      ),
    }

    if (request.serviceStaffNumber) body[this.col('servicestaffnumber')] = request.serviceStaffNumber
    if (request.militaryCivilianLabel) {
      body[this.col('militarycivilian')] = getMilCivTypeValue(request.militaryCivilianLabel)
    }
    if (request.genderLabel) {
      body[this.col('gender')] = getGenderValue(request.genderLabel)
    }
    if (request.dateOfBirth) body[this.col('dateofbirth')] = request.dateOfBirth
    if (request.passportNumber) body[this.col('passportnumber')] = request.passportNumber
    if (request.passportIssueDate) body[this.col('passportissuedate')] = request.passportIssueDate
    if (request.passportExpiryDate) body[this.col('passportexpirydate')] = request.passportExpiryDate
    if (request.visaNumber) body[this.col('visanumber')] = request.visaNumber
    if (request.visaIssueDate) body[this.col('visaissuedate')] = request.visaIssueDate
    if (request.visaExpiryDate) body[this.col('visaexpirydate')] = request.visaExpiryDate
    if (request.amed !== undefined) body[this.col('amed')] = request.amed
    if (request.amedDetails) body[this.col('ameddetails')] = request.amedDetails
    if (request.allergy !== undefined) body[this.col('allergy')] = request.allergy
    if (request.allergyDetails) body[this.col('allergydetails')] = request.allergyDetails
    if (request.severity) body[this.col('severity')] = request.severity
    if (request.specialRequests) body[this.col('specialrequests')] = request.specialRequests
    if (request.mealDetails) body[this.col('mealdetails')] = request.mealDetails
    if (request.pointOfContactName) body[this.col('pointofcontactname')] = request.pointOfContactName
    if (request.contactEmailAddress) body[this.col('contactemailaddress')] = request.contactEmailAddress
    if (request.contactNumberWorkingHours) body[this.col('contactnumberworkinghours')] = request.contactNumberWorkingHours
    if (request.contactNumberOutOfHours) body[this.col('contactnumberoutofhours')] = request.contactNumberOutOfHours
    if (request.emergencyContactNumber) body[this.col('emergencycontactnumber')] = request.emergencyContactNumber
    if (request.paxPhoneNumber) body[this.col('paxphonenumber')] = request.paxPhoneNumber
    if (request.emailOfTraveller) body[this.col('emailoftraveller')] = request.emailOfTraveller

    const fromId = toGuid(request.fromId)
    if (fromId) body[`${this.nav('from')}@odata.bind`] = `/cap_airports(${fromId})`
    const toId = toGuid(request.toId)
    if (toId) body[`${this.nav('to')}@odata.bind`] = `/cap_airports(${toId})`
    const authoriserId = toGuid(request.authoriserId)
    if (authoriserId) {
      body[`${this.nav('authoriser')}@odata.bind`] = `/${getPrefixedEntitySet(env.dataverseEntitySetAuthoriser)}(${authoriserId})`
    }
    const nationalityId = toGuid(request.nationalityId)
    if (nationalityId) body[`${this.nav('nationality')}@odata.bind`] = `/cap_countries(${nationalityId})`
    const passportCountryId = toGuid(request.passportCountryOfIssueId)
    if (passportCountryId) {
      body[`${this.nav('passportcountryofissue')}@odata.bind`] = `/cap_countries(${passportCountryId})`
    }
    const visaCountryId = toGuid(request.visaCountryOfIssueId)
    if (visaCountryId) body[`${this.nav('visacountryofissue')}@odata.bind`] = `/cap_countries(${visaCountryId})`
    const purposeOfTravelId = toGuid(request.purposeOfTravelId)
    if (purposeOfTravelId) {
      body[`${this.nav('purposeoftravel')}@odata.bind`] = `/cap_purposeoftravels(${purposeOfTravelId})`
    }
    const disabilityId = toGuid(request.disabilityId)
    if (disabilityId) body[`${this.nav('disability')}@odata.bind`] = `/cap_disabilities(${disabilityId})`
    const mealDietaryId = toGuid(request.mealDietaryId)
    if (mealDietaryId) {
      body[`${this.nav('mealdietary')}@odata.bind`] = `/cap_mealdietarytypes(${mealDietaryId})`
    }

    // Only add group binding if groupId is a valid non-empty GUID
    if (request.groupId && request.groupId.trim() && request.groupId !== 'undefined') {
      const cleanGroupId = request.groupId.replace(/[{}]/g, '').trim()
      console.log('Group ID received:', request.groupId)
      console.log('Clean Group ID:', cleanGroupId)
      // Validate it looks like a GUID
      if (/^[0-9a-f-]{36}$/i.test(cleanGroupId)) {
        body[`${this.nav('group')}@odata.bind`] = `/${this.getFullEntitySetGroup()}(${cleanGroupId})`
        console.log('Group binding:', body[`${this.nav('group')}@odata.bind`])
      } else {
        console.warn('Invalid GUID format:', cleanGroupId)
      }
    }

    console.log('Full paxdetails payload:', JSON.stringify(body, null, 2))

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new Error(
          `Dataverse create failed: 404 Not Found. The entity set name is probably wrong. Update VITE_DATAVERSE_ENTITY_SET. URL: ${url} ${text}`,
        )
      }
      if (res.status === 403) {
        throw new Error(
          `Dataverse create failed: 403 Forbidden. Your Dataverse security role does not allow creating passenger requests. URL: ${url} ${text}`,
        )
      }
      throw new Error(
        `Dataverse create failed: ${res.status} ${res.statusText}. URL: ${url} ${text}`,
      )
    }

    const entityId = res.headers.get('OData-EntityId') ?? undefined
    
    // Fetch the created record to get the auto-generated jdr_name reference
    let referenceName: string | undefined
    if (entityId) {
      try {
        const nameCol = this.col('name')
        const fetchUrl = `${entityId}?$select=${nameCol}`
        const record = await this.fetchJson<Record<string, unknown>>(account, fetchUrl)
        referenceName = record[nameCol] as string | undefined
      } catch {
        // If we can't fetch the name, just continue without it
      }
    }
    
    return { id: entityId, referenceName }
  }

  async createPaxGroup(
    account: AccountInfo,
    leadPassengerName: string,
    passengerCount: number,
    authoriserId?: string,
  ): Promise<CreatePaxGroupResult> {
    if (env.useMock) {
      const id = crypto.randomUUID()
      const key = 'mockPaxGroups'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
        id: string
        name: string
        passengerCount: number
        createdAt: string
      }>
      const groupName = `${leadPassengerName} +${passengerCount - 1}`
      existing.unshift({
        id,
        name: groupName,
        passengerCount,
        createdAt: new Date().toISOString(),
      })
      localStorage.setItem(key, JSON.stringify(existing))
      return { id, odataId: id, groupName }
    }

    const token = await this.getAccessToken(account)
    const entitySet = this.getFullEntitySetGroup()
    const url = `${env.dataverseUrl.replace(/\/$/, '')}/api/data/v9.2/${entitySet}`
    const groupName = `${leadPassengerName} +${passengerCount - 1}`

    const body: Record<string, unknown> = {
      [this.col('groupname')]: groupName,
      [this.col('passengercount')]: passengerCount,
    }
    const cleanAuthoriserId = toGuid(authoriserId)
    if (cleanAuthoriserId) {
      body[`${this.nav('authoriser')}@odata.bind`] = `/${getPrefixedEntitySet(env.dataverseEntitySetAuthoriser)}(${cleanAuthoriserId})`
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 404) {
        throw new Error(
          `Dataverse create group failed: 404 Not Found. The entity set name is probably wrong. Update VITE_DATAVERSE_ENTITY_SET_GROUP. URL: ${url} ${text}`,
        )
      }
      if (res.status === 403) {
        throw new Error(
          `Dataverse create group failed: 403 Forbidden. Your Dataverse security role does not allow creating passenger groups. URL: ${url} ${text}`,
        )
      }
      throw new Error(
        `Dataverse create group failed: ${res.status} ${res.statusText}. URL: ${url} ${text}`,
      )
    }

    const entityId = res.headers.get('OData-EntityId') ?? undefined
    const idField = this.getPrimaryIdField(entitySet)
    let recordId: string | undefined

    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      try {
        const data = (await res.json()) as Record<string, unknown>
        recordId = data[idField] as string | undefined
      } catch {
        // ignore parse errors
      }
    }

    // Extract GUID from OData-EntityId header as fallback
    // Format: https://org.../api/data/v9.2/jdr_paxgroups(GUID)
    if (!recordId && entityId) {
      const match = entityId.match(/\(([0-9a-f-]{36})\)/i)
      if (match) {
        recordId = match[1]
      }
    }

    console.log('createPaxGroup - entityId header:', entityId)
    console.log('createPaxGroup - idField:', idField)
    console.log('createPaxGroup - recordId:', recordId)

    return { id: recordId, odataId: entityId, groupName }
  }

  async listMyPassengerRequests(account: AccountInfo): Promise<PassengerRequestListItem[]> {
    if (env.useMock) {
      const key = 'mockPassengerRequests'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<
        PassengerRequest & { id: string; createdAt: string }
      >
      return existing.map((r) => ({
        id: r.id,
        odataId: undefined,
        etag: undefined,
        surname: r.surname,
        forenames: r.forenames,
        departingFromIata: r.departingFromIata,
        destinationIata: r.destinationIata,
        transportRequestStatusLabel: r.transportRequestStatusLabel,
        departingOn: r.departingOn,
        returningOn: r.returningOn,
        createdOn: r.createdAt,
      }))
    }

    const base = env.dataverseUrl.replace(/\/$/, '')
    const who = await this.getWhoAmI(account)
    const entitySet = this.getFullEntitySet()
    const idField = this.getPrimaryIdField(entitySet)

    const surnameCol = this.col('surname')
    const forenamesCol = this.col('forenames')
    const fromLookupCol = `_${this.col('from')}_value`
    const toLookupCol = `_${this.col('to')}_value`
    const groupLookupCol = `_${this.col('group')}_value`
    const authoriserLookupCol = `_${this.col('authoriser')}_value`
    const createdByLookupCol = '_createdby_value'
    const departingOnCol = this.col('departingon')
    const returningOnCol = this.col('returningon')
    const statusCol = this.col('transportrequeststatus')

    const filter = encodeURIComponent(`_createdby_value eq ${who.UserId}`)
    const select = encodeURIComponent(
      `${surnameCol},${forenamesCol},${fromLookupCol},${toLookupCol},${groupLookupCol},${authoriserLookupCol},${createdByLookupCol},${departingOnCol},${returningOnCol},${statusCol},createdon,${idField}`,
    )
    const orderBy = encodeURIComponent('createdon desc')

    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$filter=${filter}&$orderby=${orderBy}`

    const res = await this.fetchJson<{
      value?: Array<ODataEntityId & Record<string, unknown>>
    }>(account, url)

    const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`
    const fromFormattedKey = `${fromLookupCol}@OData.Community.Display.V1.FormattedValue`
    const toFormattedKey = `${toLookupCol}@OData.Community.Display.V1.FormattedValue`
    const groupFormattedKey = `${groupLookupCol}@OData.Community.Display.V1.FormattedValue`
    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v[surnameCol] as string | undefined,
      forenames: v[forenamesCol] as string | undefined,
      departingFromIata:
        (v[fromFormattedKey] as string | undefined) ??
        (v[fromLookupCol] as string | undefined),
      destinationIata:
        (v[toFormattedKey] as string | undefined) ??
        (v[toLookupCol] as string | undefined),
      groupId: v[groupLookupCol] as string | undefined,
      groupName: v[groupFormattedKey] as string | undefined,
      authoriserId: v[authoriserLookupCol] as string | undefined,
      createdById: v[createdByLookupCol] as string | undefined,
      transportRequestStatusLabel:
        (v[statusFormattedKey] as string | undefined) ??
        getTransportRequestStatusLabelFromValue(v[statusCol] as number | undefined),
      departingOn: v[departingOnCol] as string | undefined,
      returningOn: v[returningOnCol] as string | undefined,
      createdOn: v.createdon as string | undefined,
    }))
  }

  async listAllPassengerRequests(account: AccountInfo): Promise<PassengerRequestListItem[]> {
    if (env.useMock) {
      const key = 'mockPassengerRequests'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<
        PassengerRequest & { id: string; createdAt: string }
      >
      return existing.map((r) => ({
        id: r.id,
        odataId: r.id,
        etag: undefined,
        surname: r.surname,
        forenames: r.forenames,
        departingFromIata: r.departingFromIata,
        destinationIata: r.destinationIata,
        transportRequestStatusLabel: r.transportRequestStatusLabel,
        departingOn: r.departingOn,
        returningOn: r.returningOn,
        createdOn: r.createdAt,
      }))
    }

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = this.getFullEntitySet()
    const idField = this.getPrimaryIdField(entitySet)

    const surnameCol = this.col('surname')
    const forenamesCol = this.col('forenames')
    const fromLookupCol = `_${this.col('from')}_value`
    const toLookupCol = `_${this.col('to')}_value`
    const groupLookupCol = `_${this.col('group')}_value`
    const authoriserLookupCol = `_${this.col('authoriser')}_value`
    const createdByLookupCol = '_createdby_value'
    const departingOnCol = this.col('departingon')
    const returningOnCol = this.col('returningon')
    const statusCol = this.col('transportrequeststatus')

    const select = encodeURIComponent(
      `${surnameCol},${forenamesCol},${fromLookupCol},${toLookupCol},${groupLookupCol},${authoriserLookupCol},${createdByLookupCol},${departingOnCol},${returningOnCol},${statusCol},createdon,${idField}`,
    )
    const orderBy = encodeURIComponent('createdon desc')
    const top = 100
    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$orderby=${orderBy}&$top=${top}`

    const res = await this.fetchJson<{
      value?: Array<ODataEntityId & Record<string, unknown>>
    }>(account, url)

    const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`
    const fromFormattedKey = `${fromLookupCol}@OData.Community.Display.V1.FormattedValue`
    const toFormattedKey = `${toLookupCol}@OData.Community.Display.V1.FormattedValue`
    const groupFormattedKey = `${groupLookupCol}@OData.Community.Display.V1.FormattedValue`
    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v[surnameCol] as string | undefined,
      forenames: v[forenamesCol] as string | undefined,
      departingFromIata:
        (v[fromFormattedKey] as string | undefined) ??
        (v[fromLookupCol] as string | undefined),
      destinationIata:
        (v[toFormattedKey] as string | undefined) ??
        (v[toLookupCol] as string | undefined),
      groupId: v[groupLookupCol] as string | undefined,
      groupName: v[groupFormattedKey] as string | undefined,
      authoriserId: v[authoriserLookupCol] as string | undefined,
      createdById: v[createdByLookupCol] as string | undefined,
      transportRequestStatusLabel:
        (v[statusFormattedKey] as string | undefined) ??
        getTransportRequestStatusLabelFromValue(v[statusCol] as number | undefined),
      departingOn: v[departingOnCol] as string | undefined,
      returningOn: v[returningOnCol] as string | undefined,
      createdOn: v.createdon as string | undefined,
    }))
  }

  /**
   * Query passenger requests using a saved Dataverse view (savedQuery).
   * The view defines which columns to return and which filters to apply.
   */
  async listPassengerRequestsByView(
    account: AccountInfo,
    viewGuid: string,
  ): Promise<PassengerRequestListItem[]> {
    if (env.useMock) {
      // In mock mode, just return all requests
      return this.listAllPassengerRequests(account)
    }

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = this.getFullEntitySet()
    const idField = this.getPrimaryIdField(entitySet)

    // Query using savedQuery parameter - Dataverse will apply the view's columns and filters
    const cleanGuid = viewGuid.replace(/[{}]/g, '')
    const url = `${base}/api/data/v9.2/${entitySet}?savedQuery=${cleanGuid}`

    const res = await this.fetchJson<{
      value?: Array<ODataEntityId & Record<string, unknown>>
    }>(account, url)

    // Map response - column names come from the view, we need to handle them dynamically
    const surnameCol = this.col('surname')
    const forenamesCol = this.col('forenames')
    const fromLookupCol = `_${this.col('from')}_value`
    const toLookupCol = `_${this.col('to')}_value`
    const groupLookupCol = `_${this.col('group')}_value`
    const authoriserLookupCol = `_${this.col('authoriser')}_value`
    const createdByLookupCol = '_createdby_value'
    const departingOnCol = this.col('departingon')
    const returningOnCol = this.col('returningon')
    const statusCol = this.col('transportrequeststatus')
    const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`
    const fromFormattedKey = `${fromLookupCol}@OData.Community.Display.V1.FormattedValue`
    const toFormattedKey = `${toLookupCol}@OData.Community.Display.V1.FormattedValue`
    const groupFormattedKey = `${groupLookupCol}@OData.Community.Display.V1.FormattedValue`

    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v[surnameCol] as string | undefined,
      forenames: v[forenamesCol] as string | undefined,
      departingFromIata:
        (v[fromFormattedKey] as string | undefined) ??
        (v[fromLookupCol] as string | undefined),
      destinationIata:
        (v[toFormattedKey] as string | undefined) ??
        (v[toLookupCol] as string | undefined),
      groupId: v[groupLookupCol] as string | undefined,
      groupName: v[groupFormattedKey] as string | undefined,
      authoriserId: v[authoriserLookupCol] as string | undefined,
      createdById: v[createdByLookupCol] as string | undefined,
      transportRequestStatusLabel:
        (v[statusFormattedKey] as string | undefined) ??
        getTransportRequestStatusLabelFromValue(v[statusCol] as number | undefined),
      departingOn: v[departingOnCol] as string | undefined,
      returningOn: v[returningOnCol] as string | undefined,
      createdOn: v.createdon as string | undefined,
    }))
  }

  async updatePassengerRequest(
    account: AccountInfo,
    item: Pick<PassengerRequestListItem, 'odataId' | 'etag'>,
    patch: Partial<PassengerRequest>,
  ): Promise<void> {
    if (env.useMock) {
      const key = 'mockPassengerRequests'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<
        PassengerRequest & { id: string; createdAt: string }
      >
      const idx = existing.findIndex((x) => x.id === (item.odataId ?? item.etag ?? ''))
      if (idx >= 0) existing[idx] = { ...existing[idx], ...patch }
      localStorage.setItem(key, JSON.stringify(existing))
      return
    }

    const odataId = item.odataId
    if (!odataId) throw new Error('Missing Dataverse record id (odataId)')

    const body: Record<string, unknown> = {}
    if (patch.surname !== undefined) body[this.col('surname')] = patch.surname
    if (patch.forenames !== undefined) body[this.col('forenames')] = patch.forenames
    if (patch.documentTypeLabel !== undefined) {
      body[this.col('documenttype')] = getDocumentTypeValue(patch.documentTypeLabel)
    }
    if (patch.documentNumber !== undefined) body[this.col('documentnumber')] = patch.documentNumber
    if (patch.departingOn !== undefined) body[this.col('departingon')] = toIsoDateTime(patch.departingOn)
    if (patch.returningOn !== undefined) body[this.col('returningon')] = toIsoDateTime(patch.returningOn)
    const patchAuthoriserId = toGuid(patch.authoriserId)
    if (patchAuthoriserId) {
      body[`${this.nav('authoriser')}@odata.bind`] = `/${getPrefixedEntitySet(env.dataverseEntitySetAuthoriser)}(${patchAuthoriserId})`
    }
    if (patch.transportRequestStatusLabel !== undefined) {
      body[this.col('transportrequeststatus')] = getTransportRequestStatusValue(patch.transportRequestStatusLabel)
    }
    if (patch.serviceStaffNumber !== undefined) body[this.col('servicestaffnumber')] = patch.serviceStaffNumber
    if (patch.militaryCivilianLabel !== undefined && patch.militaryCivilianLabel.length > 0) {
      body[this.col('militarycivilian')] = getMilCivTypeValue(patch.militaryCivilianLabel)
    }
    if (patch.genderLabel !== undefined && patch.genderLabel.length > 0) {
      body[this.col('gender')] = getGenderValue(patch.genderLabel)
    }
    if (patch.dateOfBirth !== undefined) body[this.col('dateofbirth')] = patch.dateOfBirth
    if (patch.passportNumber !== undefined) body[this.col('passportnumber')] = patch.passportNumber
    if (patch.passportIssueDate !== undefined) body[this.col('passportissuedate')] = patch.passportIssueDate
    if (patch.passportExpiryDate !== undefined) body[this.col('passportexpirydate')] = patch.passportExpiryDate
    if (patch.visaNumber !== undefined) body[this.col('visanumber')] = patch.visaNumber
    if (patch.visaIssueDate !== undefined) body[this.col('visaissuedate')] = patch.visaIssueDate
    if (patch.visaExpiryDate !== undefined) body[this.col('visaexpirydate')] = patch.visaExpiryDate
    if (patch.amed !== undefined) body[this.col('amed')] = patch.amed
    if (patch.amedDetails !== undefined) body[this.col('ameddetails')] = patch.amedDetails
    if (patch.allergy !== undefined) body[this.col('allergy')] = patch.allergy
    if (patch.allergyDetails !== undefined) body[this.col('allergydetails')] = patch.allergyDetails
    if (patch.severity !== undefined) body[this.col('severity')] = patch.severity
    if (patch.specialRequests !== undefined) body[this.col('specialrequests')] = patch.specialRequests
    if (patch.mealDetails !== undefined) body[this.col('mealdetails')] = patch.mealDetails
    if (patch.pointOfContactName !== undefined) body[this.col('pointofcontactname')] = patch.pointOfContactName
    if (patch.contactEmailAddress !== undefined) body[this.col('contactemailaddress')] = patch.contactEmailAddress
    if (patch.contactNumberWorkingHours !== undefined) body[this.col('contactnumberworkinghours')] = patch.contactNumberWorkingHours
    if (patch.contactNumberOutOfHours !== undefined) body[this.col('contactnumberoutofhours')] = patch.contactNumberOutOfHours
    if (patch.emergencyContactNumber !== undefined) body[this.col('emergencycontactnumber')] = patch.emergencyContactNumber
    if (patch.paxPhoneNumber !== undefined) body[this.col('paxphonenumber')] = patch.paxPhoneNumber
    if (patch.emailOfTraveller !== undefined) body[this.col('emailoftraveller')] = patch.emailOfTraveller

    const patchFromId = toGuid(patch.fromId)
    if (patchFromId) body[`${this.nav('from')}@odata.bind`] = `/cap_airports(${patchFromId})`
    const patchToId = toGuid(patch.toId)
    if (patchToId) body[`${this.nav('to')}@odata.bind`] = `/cap_airports(${patchToId})`
    const patchNationalityId = toGuid(patch.nationalityId)
    if (patchNationalityId) body[`${this.nav('nationality')}@odata.bind`] = `/cap_countries(${patchNationalityId})`
    const patchPassportCountryId = toGuid(patch.passportCountryOfIssueId)
    if (patchPassportCountryId) {
      body[`${this.nav('passportcountryofissue')}@odata.bind`] = `/cap_countries(${patchPassportCountryId})`
    }
    const patchVisaCountryId = toGuid(patch.visaCountryOfIssueId)
    if (patchVisaCountryId) {
      body[`${this.nav('visacountryofissue')}@odata.bind`] = `/cap_countries(${patchVisaCountryId})`
    }
    const patchPurposeId = toGuid(patch.purposeOfTravelId)
    if (patchPurposeId) {
      body[`${this.nav('purposeoftravel')}@odata.bind`] = `/cap_purposeoftravels(${patchPurposeId})`
    }
    const patchDisabilityId = toGuid(patch.disabilityId)
    if (patchDisabilityId) body[`${this.nav('disability')}@odata.bind`] = `/cap_disabilities(${patchDisabilityId})`
    const patchMealId = toGuid(patch.mealDietaryId)
    if (patchMealId) body[`${this.nav('mealdietary')}@odata.bind`] = `/cap_mealdietarytypes(${patchMealId})`

    const token = await this.getAccessToken(account)
    const res = await fetch(odataId, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-Match': item.etag ?? '*',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      if (res.status === 412) {
        throw new Error(
          `Dataverse update failed: 412 Precondition Failed. The record was modified by someone else. Refresh and try again. URL: ${odataId} ${text}`,
        )
      }
      if (res.status === 403) {
        throw new Error(
          `Dataverse update failed: 403 Forbidden. Your Dataverse security role does not allow updating passenger requests. URL: ${odataId} ${text}`,
        )
      }
      throw new Error(`Dataverse update failed: ${res.status} ${res.statusText}. URL: ${odataId} ${text}`)
    }
  }

  async reassignPassengerBookingOwnerToUser(
    account: AccountInfo,
    item: Pick<PassengerRequestListItem, 'odataId' | 'etag'>,
    ownerSystemUserId: string,
  ): Promise<void> {
    if (env.useMock) return
    if (!item.odataId) throw new Error('Missing Dataverse record id (odataId)')
    const ownerId = toGuid(ownerSystemUserId)
    if (!ownerId) throw new Error('Missing or invalid owner system user id')

    const token = await this.getAccessToken(account)
    const body: Record<string, unknown> = {
      'ownerid@odata.bind': `/systemusers(${ownerId})`,
    }

    const res = await fetch(item.odataId, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-Match': item.etag ?? '*',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dataverse owner reassignment failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  async listAllPaxGroups(account: AccountInfo): Promise<PaxGroupListItem[]> {
    if (env.useMock) {
      const key = 'mockPaxGroups'
      const existing = JSON.parse(localStorage.getItem(key) ?? '[]') as Array<{
        id: string
        name: string
        passengerCount: number
        createdAt: string
      }>
      return existing.map((r) => ({
        id: r.id,
        odataId: r.id,
        etag: undefined,
        name: r.name,
        passengerCount: r.passengerCount,
        createdOn: r.createdAt,
        statusLabel: 'In Progress',
      }))
    }

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = this.getFullEntitySetGroup()
    const idField = this.getPrimaryIdField(entitySet)

    const nameCol = this.col('name')
    const countCol = this.col('passengercount')

    const select = encodeURIComponent(`${nameCol},${countCol},createdon,${idField}`)
    const orderBy = encodeURIComponent('createdon desc')
    const top = 100
    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$orderby=${orderBy}&$top=${top}`

    const res = await this.fetchJson<{
      value?: Array<ODataEntityId & Record<string, unknown>>
    }>(account, url)

    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      name: v[nameCol] as string | undefined,
      passengerCount: v[countCol] as number | undefined,
      createdOn: v.createdon as string | undefined,
      statusLabel: 'In Progress',
    }))
  }

  async listGroupsByView(account: AccountInfo, viewGuid: string): Promise<PaxGroupListItem[]> {
    if (env.useMock) return this.listAllPaxGroups(account)

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = this.getFullEntitySetGroup()
    const idField = this.getPrimaryIdField(entitySet)
    const nameCol = this.col('groupname')
    const countCol = this.col('passengercount')
    const authoriserLookupCol = `_${this.col('authoriser')}_value`
    const cleanGuid = viewGuid.replace(/[{}]/g, '')
    const url = `${base}/api/data/v9.2/${entitySet}?savedQuery=${cleanGuid}`

    const res = await this.fetchJson<{
      value?: Array<ODataEntityId & Record<string, unknown>>
    }>(account, url)

    return (res.value ?? []).map((row) => {
      const id =
        (typeof row[idField] === 'string' ? row[idField] : undefined) ??
        extractGuid(typeof row['@odata.id'] === 'string' ? row['@odata.id'] : undefined)
      return {
        id,
        odataId:
          (row['@odata.id'] as string | undefined) ??
          (id ? this.buildRecordUrl(base, entitySet, id) : undefined),
        etag: row['@odata.etag'],
        name: row[nameCol] as string | undefined,
        passengerCount: row[countCol] as number | undefined,
        createdOn: row.createdon as string | undefined,
        authoriserId: row[authoriserLookupCol] as string | undefined,
      }
    })
  }

  async updateGroupAuthorisationReference(
    account: AccountInfo,
    groupId: string,
    authorisationId: string,
  ): Promise<void> {
    if (env.useMock) return

    const cleanGroupId = toGuid(groupId)
    const cleanAuthorisationId = toGuid(authorisationId)
    if (!cleanGroupId) throw new Error('Missing or invalid group id.')
    if (!cleanAuthorisationId) throw new Error('Missing or invalid authorisation id.')

    const base = env.dataverseUrl.replace(/\/$/, '')
    const groupEntitySet = this.getFullEntitySetGroup()
    const token = await this.getAccessToken(account)
    const body: Record<string, unknown> = {
      [`${this.nav('authorisationreference')}@odata.bind`]: `/${getPrefixedEntitySet('authorisations')}(${cleanAuthorisationId})`,
    }

    const res = await fetch(`${base}/api/data/v9.2/${groupEntitySet}(${cleanGroupId})`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-Match': '*',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dataverse group authorisation reference update failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  async updatePassengerBookingAuthorisationReference(
    account: AccountInfo,
    passengerBookingId: string,
    authorisationId: string,
  ): Promise<void> {
    if (env.useMock) return

    const cleanBookingId = toGuid(passengerBookingId)
    const cleanAuthorisationId = toGuid(authorisationId)
    if (!cleanBookingId) throw new Error('Missing or invalid passenger booking id.')
    if (!cleanAuthorisationId) throw new Error('Missing or invalid authorisation id.')

    const base = env.dataverseUrl.replace(/\/$/, '')
    const bookingEntitySet = this.getFullEntitySet()
    const token = await this.getAccessToken(account)
    const body: Record<string, unknown> = {
      [`${this.nav('authroisationreference')}@odata.bind`]: `/${getPrefixedEntitySet('authorisations')}(${cleanAuthorisationId})`,
    }

    const res = await fetch(`${base}/api/data/v9.2/${bookingEntitySet}(${cleanBookingId})`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-Match': '*',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dataverse passenger authorisation reference update failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  async getAuthorisationForPassengerBooking(
    account: AccountInfo,
    passengerBookingId: string,
  ): Promise<AuthorisationRecord | null> {
    if (env.useMock) return null

    const bookingId = toGuid(passengerBookingId)
    if (!bookingId) return null

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = getPrefixedEntitySet('authorisations')
    const idField = this.getPrimaryIdField(entitySet)

    const refCol = this.col('authorisationreference')
    const authoriserCol = this.col('authorisername')
    const contactCol = this.col('contactnumber')
    const dateCol = this.col('dateofauthorisation')
    const emailCol = this.col('email')
    const uinCol = this.col('uin')
    const receivingCol = this.col('receivingunitorfamilyaddress')
    const jfetCol = this.col('jfetno')
    const jpanCol = this.col('jpan')
    const altCol = this.col('alternativeexceptionalauthority')
    const reasonCol = this.col('reasonfortravelvisit')
    const specialCol = this.col('specialrequests')
    const authStatusCol = this.col('authorisationstatus')
    const authStatusFormattedKey = `${authStatusCol}@OData.Community.Display.V1.FormattedValue`

    const passengerLookup = `_${this.col('passengerbooking')}_value`
    const purposeLookup = `_${this.col('purposeoftravelcode')}_value`
    const rankLookup = `_${this.col('rankgrade')}_value`
    const serviceLookup = `_${this.col('servicecode')}_value`
    const travelLookup = `_${this.col('travelcode')}_value`

    const select = encodeURIComponent([
      idField,
      refCol,
      authoriserCol,
      contactCol,
      dateCol,
      emailCol,
      uinCol,
      receivingCol,
      jfetCol,
      jpanCol,
      altCol,
      reasonCol,
      specialCol,
      authStatusCol,
      passengerLookup,
      purposeLookup,
      rankLookup,
      serviceLookup,
      travelLookup,
    ].join(','))

    const filter = encodeURIComponent(`${passengerLookup} eq ${bookingId}`)
    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$filter=${filter}&$top=1`
    const res = await this.fetchJson<{ value?: Array<ODataEntityId & Record<string, unknown>> }>(account, url)
    const row = (res.value ?? [])[0]
    if (!row) return null

    const odataId = (row['@odata.id'] as string | undefined) ??
      (row[idField] ? this.buildRecordUrl(base, entitySet, String(row[idField])) : undefined)

    return {
      id: row[idField] as string | undefined,
      odataId,
      etag: row['@odata.etag'],
      passengerBookingId: String(row[passengerLookup] ?? bookingId),
      authorisationReference: String(row[refCol] ?? ''),
      authoriserName: String(row[authoriserCol] ?? ''),
      contactNumber: String(row[contactCol] ?? ''),
      dateOfAuthorisation: String(row[dateCol] ?? ''),
      email: String(row[emailCol] ?? ''),
      uin: String(row[uinCol] ?? ''),
      receivingUnitOrFamilyAddress: String(row[receivingCol] ?? ''),
      purposeOfTravelCodeId: String(row[purposeLookup] ?? ''),
      rankGradeId: String(row[rankLookup] ?? ''),
      serviceCodeId: String(row[serviceLookup] ?? ''),
      travelCodeId: String(row[travelLookup] ?? ''),
      jfetNo: row[jfetCol] as string | undefined,
      jpan: row[jpanCol] as string | undefined,
      alternativeExceptionalAuthority: row[altCol] as string | undefined,
      reasonForTravelVisit: row[reasonCol] as string | undefined,
      specialRequests: row[specialCol] as string | undefined,
      authorisationStatusLabel:
        (row[authStatusFormattedKey] as string | undefined) ??
        getAuthorisationStatusLabelFromValue(row[authStatusCol] as number | undefined),
    }
  }

  async saveAuthorisation(
    account: AccountInfo,
    record: AuthorisationRecord,
  ): Promise<void> {
    if (env.useMock) return

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = getPrefixedEntitySet('authorisations')
    const passengerBookingId = toGuid(record.passengerBookingId)
    const purposeOfTravelId = toGuid(record.purposeOfTravelCodeId)
    const rankId = toGuid(record.rankGradeId)
    const serviceId = toGuid(record.serviceCodeId)
    const travelId = toGuid(record.travelCodeId)
    const bookingOfficeId = toGuid(record.bookingOfficeId)

    if (!passengerBookingId || !purposeOfTravelId || !rankId || !serviceId || !travelId) {
      throw new Error('Missing or invalid required authorisation lookup values.')
    }

    const body: Record<string, unknown> = {
      [this.col('authorisationreference')]: record.authorisationReference,
      [this.col('authorisername')]: record.authoriserName,
      [this.col('authorisationstatus')]: getAuthorisationStatusValue(record.authorisationStatusLabel ?? 'Approved by Authoriser'),
      [this.col('contactnumber')]: record.contactNumber,
      [this.col('dateofauthorisation')]: record.dateOfAuthorisation,
      [this.col('email')]: record.email,
      [this.col('uin')]: record.uin,
      [this.col('receivingunitorfamilyaddress')]: record.receivingUnitOrFamilyAddress,
      [this.col('jfetno')]: record.jfetNo ?? null,
      [this.col('jpan')]: record.jpan ?? null,
      [this.col('alternativeexceptionalauthority')]: record.alternativeExceptionalAuthority ?? null,
      [this.col('reasonfortravelvisit')]: record.reasonForTravelVisit ?? null,
      [this.col('specialrequests')]: record.specialRequests ?? null,
      [`${this.nav('passengerbooking')}@odata.bind`]: `/${getPrefixedEntitySet('paxdetails')}(${passengerBookingId})`,
      [`${this.nav('purposeoftravelcode')}@odata.bind`]: `/${getPrefixedEntitySet('purposeoftravels')}(${purposeOfTravelId})`,
      [`${this.nav('rankgrade')}@odata.bind`]: `/${getPrefixedEntitySet('ranks')}(${rankId})`,
      [`${this.nav('servicecode')}@odata.bind`]: `/${getPrefixedEntitySet('servicecodes')}(${serviceId})`,
      [`${this.nav('travelcode')}@odata.bind`]: `/${getPrefixedEntitySet('travelcodes')}(${travelId})`,
    }

    if (bookingOfficeId) {
      body[`${this.nav('bookingoffice')}@odata.bind`] = `/teams(${bookingOfficeId})`
    }
    if (typeof record.stateCode === 'number') {
      body.statecode = record.stateCode
    }
    if (typeof record.statusCode === 'number') {
      body.statuscode = record.statusCode
    }

    const token = await this.getAccessToken(account)
    const existing = await this.getAuthorisationForPassengerBooking(account, passengerBookingId)
    const patchUrl = existing?.odataId
    const url = patchUrl ?? `${base}/api/data/v9.2/${entitySet}`
    const method = patchUrl ? 'PATCH' : 'POST'

    const executeSave = async (payload: Record<string, unknown>): Promise<{ ok: boolean; text: string; status: number; statusText: string }> => {
      const res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
          ...(patchUrl ? { 'If-Match': existing?.etag ?? '*' } : {}),
        },
        body: JSON.stringify(payload),
      })
      const text = await res.text().catch(() => '')
      return { ok: res.ok, text, status: res.status, statusText: res.statusText }
    }

    const primaryAttempt = await executeSave(body)
    if (primaryAttempt.ok) return

    const authStatusCol = this.col('authorisationstatus')
    const canRetryWithoutAuthStatus =
      primaryAttempt.text.includes(authStatusCol) &&
      (primaryAttempt.text.includes('Could not find a property named') ||
        primaryAttempt.text.includes('does not exist on type') ||
        primaryAttempt.text.includes('Invalid property'))

    if (canRetryWithoutAuthStatus) {
      const retryBody = { ...body }
      delete retryBody[authStatusCol]
      const retryAttempt = await executeSave(retryBody)
      if (retryAttempt.ok) return
      throw new Error(
        `Dataverse authorisation save failed: ${retryAttempt.status} ${retryAttempt.statusText}. ${retryAttempt.text}`,
      )
    }

    throw new Error(
      `Dataverse authorisation save failed: ${primaryAttempt.status} ${primaryAttempt.statusText}. ${primaryAttempt.text}`,
    )
  }

  async updateAuthorisationStatusForPassengerBooking(
    account: AccountInfo,
    passengerBookingId: string,
    statusLabel: string,
  ): Promise<void> {
    if (env.useMock) return

    const bookingId = toGuid(passengerBookingId)
    if (!bookingId) throw new Error('Missing or invalid passenger booking id.')

    const existing = await this.getAuthorisationForPassengerBooking(account, bookingId)
    if (!existing?.odataId) return

    const token = await this.getAccessToken(account)
    const body: Record<string, unknown> = {
      [this.col('authorisationstatus')]: getAuthorisationStatusValue(statusLabel),
    }

    const res = await fetch(existing.odataId, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        'If-Match': existing.etag ?? '*',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const authStatusCol = this.col('authorisationstatus')
      const isMissingStatusCol =
        text.includes(authStatusCol) &&
        (text.includes('Could not find a property named') ||
          text.includes('does not exist on type') ||
          text.includes('Invalid property'))
      if (isMissingStatusCol) return
      throw new Error(`Dataverse authorisation status update failed: ${res.status} ${res.statusText}. ${text}`)
    }
  }

  async listPassengerComments(account: AccountInfo, passengerBookingId: string): Promise<PassengerComment[]> {
    if (env.useMock) return []

    const bookingId = toGuid(passengerBookingId)
    if (!bookingId) return []

    const base = env.dataverseUrl.replace(/\/$/, '')
    const filter = encodeURIComponent(`_objectid_value eq ${bookingId}`)
    const select = encodeURIComponent('annotationid,subject,notetext,createdon,_createdby_value')
    const orderBy = encodeURIComponent('createdon asc')
    const url = `${base}/api/data/v9.2/annotations?$select=${select}&$filter=${filter}&$orderby=${orderBy}`
    const res = await this.fetchJson<{ value?: Array<Record<string, unknown>> }>(account, url)

    return (res.value ?? []).map((row) => ({
      id: String(row.annotationid ?? ''),
      subject: typeof row.subject === 'string' ? row.subject : undefined,
      text: typeof row.notetext === 'string' ? row.notetext : '',
      createdOn: typeof row.createdon === 'string' ? row.createdon : undefined,
      createdBy: typeof row['_createdby_value@OData.Community.Display.V1.FormattedValue'] === 'string'
        ? String(row['_createdby_value@OData.Community.Display.V1.FormattedValue'])
        : undefined,
    })).filter((v) => v.id.length > 0)
  }

  async addPassengerComment(
    account: AccountInfo,
    passengerBookingId: string,
    subject: string,
    text: string,
  ): Promise<void> {
    if (env.useMock) return

    const bookingId = toGuid(passengerBookingId)
    if (!bookingId) throw new Error('Missing or invalid passenger booking id.')

    const token = await this.getAccessToken(account)
    const base = env.dataverseUrl.replace(/\/$/, '')
    const paxEntitySet = getPrefixedEntitySet(env.dataverseEntitySet)
    const paxLogicalName = paxEntitySet.endsWith('s') ? paxEntitySet.slice(0, -1) : paxEntitySet

    const primaryPayload: Record<string, unknown> = {
      subject,
      notetext: text,
      [`objectid_${paxLogicalName}@odata.bind`]: `/${paxEntitySet}(${bookingId})`,
    }

    const fallbackPayload: Record<string, unknown> = {
      subject,
      notetext: text,
      [`objectid_${env.dataverseEntitySet.replace(/s$/i, '')}@odata.bind`]: `/${paxEntitySet}(${bookingId})`,
    }

    const tryCreate = async (payload: Record<string, unknown>): Promise<Response> => {
      return await fetch(`${base}/api/data/v9.2/annotations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json; charset=utf-8',
          'OData-MaxVersion': '4.0',
          'OData-Version': '4.0',
        },
        body: JSON.stringify(payload),
      })
    }

    const primary = await tryCreate(primaryPayload)
    if (primary.ok) return

    const primaryText = await primary.text().catch(() => '')
    const isPropertyIssue =
      primaryText.includes('Could not find a property named') ||
      primaryText.includes('does not exist on type') ||
      primaryText.includes('Invalid property')

    if (!isPropertyIssue) {
      throw new Error(`Dataverse comment create failed: ${primary.status} ${primary.statusText}. ${primaryText}`)
    }

    const fallback = await tryCreate(fallbackPayload)
    if (fallback.ok) return

    const fallbackText = await fallback.text().catch(() => '')
    throw new Error(`Dataverse comment create failed: ${fallback.status} ${fallback.statusText}. ${fallbackText}`)
  }

  async getPassengerRequestById(
    account: AccountInfo,
    passengerBookingODataId: string,
  ): Promise<PassengerRequestListItem | null> {
    if (env.useMock) return null
    const recordUrl = passengerBookingODataId.trim()
    const guid = guidFromODataId(recordUrl)
    if (!guid) return null

    const base = env.dataverseUrl.replace(/\/$/, '')
    const entitySet = this.getFullEntitySet()
    const idField = this.getPrimaryIdField(entitySet)

    const surnameCol = this.col('surname')
    const forenamesCol = this.col('forenames')
    const serviceStaffNumberCol = this.col('servicestaffnumber')
    const militaryCivilianCol = this.col('militarycivilian')
    const genderCol = this.col('gender')
    const dateOfBirthCol = this.col('dateofbirth')
    const documentTypeCol = this.col('documenttype')
    const documentNumberCol = this.col('documentnumber')
    const passportNumberCol = this.col('passportnumber')
    const passportIssueDateCol = this.col('passportissuedate')
    const passportExpiryDateCol = this.col('passportexpirydate')
    const visaNumberCol = this.col('visanumber')
    const visaIssueDateCol = this.col('visaissuedate')
    const visaExpiryDateCol = this.col('visaexpirydate')
    const specialRequestsCol = this.col('specialrequests')
    const pointOfContactNameCol = this.col('pointofcontactname')
    const contactEmailAddressCol = this.col('contactemailaddress')
    const contactNumberWorkingHoursCol = this.col('contactnumberworkinghours')
    const contactNumberOutOfHoursCol = this.col('contactnumberoutofhours')
    const emergencyContactNumberCol = this.col('emergencycontactnumber')
    const paxPhoneNumberCol = this.col('paxphonenumber')
    const emailOfTravellerCol = this.col('emailoftraveller')
    const amedCol = this.col('amed')
    const amedDetailsCol = this.col('ameddetails')
    const allergyCol = this.col('allergy')
    const allergyDetailsCol = this.col('allergydetails')
    const severityCol = this.col('severity')
    const mealDetailsCol = this.col('mealdetails')

    const fromLookupCol = `_${this.col('from')}_value`
    const toLookupCol = `_${this.col('to')}_value`
    const nationalityLookupCol = `_${this.col('nationality')}_value`
    const passportCountryLookupCol = `_${this.col('passportcountryofissue')}_value`
    const visaCountryLookupCol = `_${this.col('visacountryofissue')}_value`
    const purposeLookupCol = `_${this.col('purposeoftravel')}_value`
    const disabilityLookupCol = `_${this.col('disability')}_value`
    const mealLookupCol = `_${this.col('mealdietary')}_value`
    const groupLookupCol = `_${this.col('group')}_value`
    const authoriserLookupCol = `_${this.col('authoriser')}_value`
    const createdByLookupCol = '_createdby_value'
    const departingOnCol = this.col('departingon')
    const returningOnCol = this.col('returningon')
    const statusCol = this.col('transportrequeststatus')

    const militaryCivilianFormattedKey = `${militaryCivilianCol}@OData.Community.Display.V1.FormattedValue`
    const genderFormattedKey = `${genderCol}@OData.Community.Display.V1.FormattedValue`
    const documentTypeFormattedKey = `${documentTypeCol}@OData.Community.Display.V1.FormattedValue`
    const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`
    const fromFormattedKey = `${fromLookupCol}@OData.Community.Display.V1.FormattedValue`
    const toFormattedKey = `${toLookupCol}@OData.Community.Display.V1.FormattedValue`
    const nationalityFormattedKey = `${nationalityLookupCol}@OData.Community.Display.V1.FormattedValue`
    const passportCountryFormattedKey = `${passportCountryLookupCol}@OData.Community.Display.V1.FormattedValue`
    const visaCountryFormattedKey = `${visaCountryLookupCol}@OData.Community.Display.V1.FormattedValue`
    const purposeFormattedKey = `${purposeLookupCol}@OData.Community.Display.V1.FormattedValue`
    const disabilityFormattedKey = `${disabilityLookupCol}@OData.Community.Display.V1.FormattedValue`
    const mealFormattedKey = `${mealLookupCol}@OData.Community.Display.V1.FormattedValue`
    const groupFormattedKey = `${groupLookupCol}@OData.Community.Display.V1.FormattedValue`

    const select = encodeURIComponent(
      [
        surnameCol,
        forenamesCol,
        serviceStaffNumberCol,
        militaryCivilianCol,
        genderCol,
        dateOfBirthCol,
        documentTypeCol,
        documentNumberCol,
        passportNumberCol,
        passportIssueDateCol,
        passportExpiryDateCol,
        visaNumberCol,
        visaIssueDateCol,
        visaExpiryDateCol,
        specialRequestsCol,
        pointOfContactNameCol,
        contactEmailAddressCol,
        contactNumberWorkingHoursCol,
        contactNumberOutOfHoursCol,
        emergencyContactNumberCol,
        paxPhoneNumberCol,
        emailOfTravellerCol,
        amedCol,
        amedDetailsCol,
        allergyCol,
        allergyDetailsCol,
        severityCol,
        mealDetailsCol,
        fromLookupCol,
        toLookupCol,
        nationalityLookupCol,
        passportCountryLookupCol,
        visaCountryLookupCol,
        purposeLookupCol,
        disabilityLookupCol,
        mealLookupCol,
        groupLookupCol,
        authoriserLookupCol,
        createdByLookupCol,
        departingOnCol,
        returningOnCol,
        statusCol,
        'createdon',
        idField,
      ].join(','),
    )
    const url = `${base}/api/data/v9.2/${entitySet}(${guid})?$select=${select}`

    const v = await this.fetchJson<ODataEntityId & Record<string, unknown>>(account, url)
    return {
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId: (v['@odata.id'] as string | undefined) ?? this.buildRecordUrl(base, entitySet, guid),
      etag: v['@odata.etag'],
      surname: v[surnameCol] as string | undefined,
      forenames: v[forenamesCol] as string | undefined,
      serviceStaffNumber: v[serviceStaffNumberCol] as string | undefined,
      militaryCivilianLabel: (v[militaryCivilianFormattedKey] as string | undefined) ?? undefined,
      genderLabel: (v[genderFormattedKey] as string | undefined) ?? undefined,
      dateOfBirth: v[dateOfBirthCol] as string | undefined,
      documentTypeLabel: (v[documentTypeFormattedKey] as string | undefined) ?? undefined,
      documentNumber: v[documentNumberCol] as string | undefined,
      passportNumber: v[passportNumberCol] as string | undefined,
      passportIssueDate: v[passportIssueDateCol] as string | undefined,
      passportExpiryDate: v[passportExpiryDateCol] as string | undefined,
      visaNumber: v[visaNumberCol] as string | undefined,
      visaIssueDate: v[visaIssueDateCol] as string | undefined,
      visaExpiryDate: v[visaExpiryDateCol] as string | undefined,
      specialRequests: v[specialRequestsCol] as string | undefined,
      pointOfContactName: v[pointOfContactNameCol] as string | undefined,
      contactEmailAddress: v[contactEmailAddressCol] as string | undefined,
      contactNumberWorkingHours: v[contactNumberWorkingHoursCol] as string | undefined,
      contactNumberOutOfHours: v[contactNumberOutOfHoursCol] as string | undefined,
      emergencyContactNumber: v[emergencyContactNumberCol] as string | undefined,
      paxPhoneNumber: v[paxPhoneNumberCol] as string | undefined,
      emailOfTraveller: v[emailOfTravellerCol] as string | undefined,
      amed: typeof v[amedCol] === 'boolean' ? (v[amedCol] as boolean) : undefined,
      amedDetails: v[amedDetailsCol] as string | undefined,
      allergy: typeof v[allergyCol] === 'boolean' ? (v[allergyCol] as boolean) : undefined,
      allergyDetails: v[allergyDetailsCol] as string | undefined,
      severity: v[severityCol] as string | undefined,
      mealDetails: v[mealDetailsCol] as string | undefined,
      departingFromIata:
        (v[fromFormattedKey] as string | undefined) ??
        (v[fromLookupCol] as string | undefined),
      destinationIata:
        (v[toFormattedKey] as string | undefined) ??
        (v[toLookupCol] as string | undefined),
      nationalityName: (v[nationalityFormattedKey] as string | undefined) ?? undefined,
      passportCountryOfIssueName: (v[passportCountryFormattedKey] as string | undefined) ?? undefined,
      visaCountryOfIssueName: (v[visaCountryFormattedKey] as string | undefined) ?? undefined,
      purposeOfTravelName: (v[purposeFormattedKey] as string | undefined) ?? undefined,
      disabilityName: (v[disabilityFormattedKey] as string | undefined) ?? undefined,
      mealDietaryName: (v[mealFormattedKey] as string | undefined) ?? undefined,
      groupId: v[groupLookupCol] as string | undefined,
      groupName: v[groupFormattedKey] as string | undefined,
      authoriserId: v[authoriserLookupCol] as string | undefined,
      createdById: v[createdByLookupCol] as string | undefined,
      transportRequestStatusLabel:
        (v[statusFormattedKey] as string | undefined) ??
        getTransportRequestStatusLabelFromValue(v[statusCol] as number | undefined),
      departingOn: v[departingOnCol] as string | undefined,
      returningOn: v[returningOnCol] as string | undefined,
      createdOn: v.createdon as string | undefined,
    }
  }
}
