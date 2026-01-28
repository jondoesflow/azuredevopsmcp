import type { AccountInfo } from '@azure/msal-browser'
import { env } from '../config'
import type { CreatePassengerRequestResult, PassengerRequest, PassengerRequestListItem } from './types'

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

  private getPrimaryIdField(entitySet: string): string {
    const es = entitySet.trim()
    let logicalName = es
    if (/ies$/i.test(logicalName)) {
      logicalName = logicalName.replace(/ies$/i, 'y')
    } else if (/es$/i.test(logicalName)) {
      // Common Dataverse pluralization: logical name ends with 's' and entity set ends with 'es'
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
        PassengerRequest & { id: string; createdAt: string }
      >
      existing.unshift({
        ...request,
        transportRequestStatusLabel: request.transportRequestStatusLabel ?? 'Submitted',
        id,
        createdAt: new Date().toISOString(),
      })
      localStorage.setItem(key, JSON.stringify(existing))
      return { id }
    }

    const token = await this.getAccessToken(account)
    const url = `${env.dataverseUrl.replace(/\/$/, '')}/api/data/v9.2/${env.dataverseEntitySet}`

    const body = {
      jdr_surname: request.surname,
      jdr_forenames: request.forenames,
      jdr_documenttype: getDocumentTypeValue(request.documentTypeLabel),
      jdr_documentnumber: request.documentNumber,
      jdr_departingon: toIsoDateTime(request.departingOn),
      jdr_returningon: toIsoDateTime(request.returningOn),
      jdr_departingfrom: request.departingFromIata,
      jdr_destination: request.destinationIata,
      jdr_transportrequeststatus: getTransportRequestStatusValue(
        request.transportRequestStatusLabel ?? 'Submitted',
      ),
    }

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
    return { id: entityId }
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
    const entitySet = env.dataverseEntitySet
    const idField = this.getPrimaryIdField(entitySet)

    // Note: _createdby_value is the typical lookup column for created by.
    const filter = encodeURIComponent(`_createdby_value eq ${who.UserId}`)
    const select = encodeURIComponent(
      `jdr_surname,jdr_forenames,jdr_departingfrom,jdr_destination,jdr_departingon,jdr_returningon,jdr_transportrequeststatus,createdon,${idField}`,
    )
    const orderBy = encodeURIComponent('createdon desc')

    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$filter=${filter}&$orderby=${orderBy}`

    const res = await this.fetchJson<{
      value?: Array<
        ODataEntityId & {
          jdr_surname?: string
          jdr_forenames?: string
          jdr_departingfrom?: string
          jdr_destination?: string
          jdr_departingon?: string
          jdr_returningon?: string
          jdr_transportrequeststatus?: number
          ['jdr_transportrequeststatus@OData.Community.Display.V1.FormattedValue']?: string
          createdon?: string
          [key: string]: unknown
        }
      >
    }>(account, url)

    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v.jdr_surname,
      forenames: v.jdr_forenames,
      departingFromIata: v.jdr_departingfrom,
      destinationIata: v.jdr_destination,
      transportRequestStatusLabel:
        v['jdr_transportrequeststatus@OData.Community.Display.V1.FormattedValue'] ??
        getTransportRequestStatusLabelFromValue(v.jdr_transportrequeststatus),
      departingOn: v.jdr_departingon,
      returningOn: v.jdr_returningon,
      createdOn: v.createdon,
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
    const entitySet = env.dataverseEntitySet
    const idField = this.getPrimaryIdField(entitySet)

    const select = encodeURIComponent(
      `jdr_surname,jdr_forenames,jdr_departingfrom,jdr_destination,jdr_departingon,jdr_returningon,jdr_transportrequeststatus,createdon,${idField}`,
    )
    const orderBy = encodeURIComponent('createdon desc')
    const top = 100
    const url = `${base}/api/data/v9.2/${entitySet}?$select=${select}&$orderby=${orderBy}&$top=${top}`

    const res = await this.fetchJson<{
      value?: Array<
        ODataEntityId & {
          jdr_surname?: string
          jdr_forenames?: string
          jdr_departingfrom?: string
          jdr_destination?: string
          jdr_departingon?: string
          jdr_returningon?: string
          jdr_transportrequeststatus?: number
          ['jdr_transportrequeststatus@OData.Community.Display.V1.FormattedValue']?: string
          createdon?: string
          [key: string]: unknown
        }
      >
    }>(account, url)

    return (res.value ?? []).map((v) => ({
      id: (v['@odata.id'] as string | undefined) ?? (v[idField] as string | undefined),
      odataId:
        (v['@odata.id'] as string | undefined) ??
        (v[idField] ? this.buildRecordUrl(base, entitySet, String(v[idField])) : undefined),
      etag: v['@odata.etag'],
      surname: v.jdr_surname,
      forenames: v.jdr_forenames,
      departingFromIata: v.jdr_departingfrom,
      destinationIata: v.jdr_destination,
      transportRequestStatusLabel:
        v['jdr_transportrequeststatus@OData.Community.Display.V1.FormattedValue'] ??
        getTransportRequestStatusLabelFromValue(v.jdr_transportrequeststatus),
      departingOn: v.jdr_departingon,
      returningOn: v.jdr_returningon,
      createdOn: v.createdon,
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
    if (patch.surname !== undefined) body.jdr_surname = patch.surname
    if (patch.forenames !== undefined) body.jdr_forenames = patch.forenames
    if (patch.documentTypeLabel !== undefined) {
      body.jdr_documenttype = getDocumentTypeValue(patch.documentTypeLabel)
    }
    if (patch.documentNumber !== undefined) body.jdr_documentnumber = patch.documentNumber
    if (patch.departingOn !== undefined) body.jdr_departingon = toIsoDateTime(patch.departingOn)
    if (patch.returningOn !== undefined) body.jdr_returningon = toIsoDateTime(patch.returningOn)
    if (patch.departingFromIata !== undefined) body.jdr_departingfrom = patch.departingFromIata
    if (patch.destinationIata !== undefined) body.jdr_destination = patch.destinationIata
    if (patch.transportRequestStatusLabel !== undefined) {
      body.jdr_transportrequeststatus = getTransportRequestStatusValue(patch.transportRequestStatusLabel)
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
}
