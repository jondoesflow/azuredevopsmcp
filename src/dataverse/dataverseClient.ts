import type { AccountInfo } from '@azure/msal-browser'
import { env, getPrefixedEntitySet, getPrefixedColumn } from '../config'
import type { CreatePassengerRequestResult, CreatePaxGroupResult, PassengerRequest, PassengerRequestListItem, PaxGroupListItem } from './types'

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

  private getPrimaryIdField(entitySet: string): string {
    const es = entitySet.trim()
    let logicalName = es
    if (/ies$/i.test(logicalName)) {
      logicalName = logicalName.replace(/ies$/i, 'y')
    } else if (/es$/i.test(logicalName)) {
      logicalName = logicalName.replace(/es$/i, '')
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

  private async fetchJson<T>(account: AccountInfo, url: string): Promise<T> {
    const token = await this.getAccessToken(account)
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
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
      [this.col('departingfrom')]: request.departingFromIata,
      [this.col('destination')]: request.destinationIata,
      [this.col('transportrequeststatus')]: getTransportRequestStatusValue(
        request.transportRequestStatusLabel ?? 'Submitted',
      ),
    }

    // Only add group binding if groupId is a valid non-empty GUID
    if (request.groupId && request.groupId.trim() && request.groupId !== 'undefined') {
      const cleanGroupId = request.groupId.replace(/[{}]/g, '').trim()
      console.log('Group ID received:', request.groupId)
      console.log('Clean Group ID:', cleanGroupId)
      // Validate it looks like a GUID
      if (/^[0-9a-f-]{36}$/i.test(cleanGroupId)) {
        body['jdr_Group@odata.bind'] = `/jdr_paxgroups(${cleanGroupId})`
        console.log('Group binding:', body['jdr_Group@odata.bind'])
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
    const departingFromCol = this.col('departingfrom')
    const destinationCol = this.col('destination')
    const departingOnCol = this.col('departingon')
    const returningOnCol = this.col('returningon')
    const statusCol = this.col('transportrequeststatus')

    const filter = encodeURIComponent(`_createdby_value eq ${who.UserId}`)
    const select = encodeURIComponent(
      `${surnameCol},${forenamesCol},${departingFromCol},${destinationCol},${departingOnCol},${returningOnCol},${statusCol},createdon,${idField}`,
    )
    const orderBy = encodeURIComponent('createdon desc')

    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$filter=${filter}&$orderby=${orderBy}`

    const res = await this.fetchJson<{
      value?: Array<ODataEntityId & Record<string, unknown>>
    }>(account, url)

    const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`
    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v[surnameCol] as string | undefined,
      forenames: v[forenamesCol] as string | undefined,
      departingFromIata: v[departingFromCol] as string | undefined,
      destinationIata: v[destinationCol] as string | undefined,
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
    const departingFromCol = this.col('departingfrom')
    const destinationCol = this.col('destination')
    const departingOnCol = this.col('departingon')
    const returningOnCol = this.col('returningon')
    const statusCol = this.col('transportrequeststatus')

    const select = encodeURIComponent(
      `${surnameCol},${forenamesCol},${departingFromCol},${destinationCol},${departingOnCol},${returningOnCol},${statusCol},createdon,${idField}`,
    )
    const orderBy = encodeURIComponent('createdon desc')
    const top = 100
    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$orderby=${orderBy}&$top=${top}`

    const res = await this.fetchJson<{
      value?: Array<ODataEntityId & Record<string, unknown>>
    }>(account, url)

    const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`
    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v[surnameCol] as string | undefined,
      forenames: v[forenamesCol] as string | undefined,
      departingFromIata: v[departingFromCol] as string | undefined,
      destinationIata: v[destinationCol] as string | undefined,
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
    const departingFromCol = this.col('departingfrom')
    const destinationCol = this.col('destination')
    const departingOnCol = this.col('departingon')
    const returningOnCol = this.col('returningon')
    const statusCol = this.col('transportrequeststatus')
    const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`

    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v[surnameCol] as string | undefined,
      forenames: v[forenamesCol] as string | undefined,
      departingFromIata: v[departingFromCol] as string | undefined,
      destinationIata: v[destinationCol] as string | undefined,
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
    if (patch.departingFromIata !== undefined) body[this.col('departingfrom')] = patch.departingFromIata
    if (patch.destinationIata !== undefined) body[this.col('destination')] = patch.destinationIata
    if (patch.transportRequestStatusLabel !== undefined) {
      body[this.col('transportrequeststatus')] = getTransportRequestStatusValue(patch.transportRequestStatusLabel)
    }

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
}
