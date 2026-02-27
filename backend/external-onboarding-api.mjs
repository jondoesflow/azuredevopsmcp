import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

loadDotEnv()

const port = Number(process.env.EXTERNAL_ONBOARDING_API_PORT || 8787)
const allowedOrigin = process.env.EXTERNAL_ONBOARDING_ALLOWED_ORIGIN || 'http://localhost:5173'
const dataverseUrl = requireEnv('EXTERNAL_ONBOARDING_DATAVERSE_URL')
const tenantId = requireEnv('EXTERNAL_ONBOARDING_TENANT_ID')
const clientId = requireEnv('EXTERNAL_ONBOARDING_CLIENT_ID')
const clientSecret = requireEnv('EXTERNAL_ONBOARDING_CLIENT_SECRET')
const solutionPrefix = normalizePrefix(
  process.env.EXTERNAL_ONBOARDING_SOLUTION_PREFIX || process.env.VITE_DATAVERSE_SOLUTION_PREFIX || 'cap_',
)

const dataverseBase = dataverseUrl.replace(/\/$/, '')
const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
const passengerColumn = `${solutionPrefix}ispassenger`
const entitySetPassenger = `${solutionPrefix}paxdetails`
const entitySetGroup = `${solutionPrefix}groups`
const entitySetAuthoriser = `${solutionPrefix}authorisers`
const choiceMaps = {
  documentType: parseChoiceMap(process.env.VITE_DOCUMENT_TYPE_MAP_JSON, 'VITE_DOCUMENT_TYPE_MAP_JSON'),
  militaryCivilian: parseChoiceMap(process.env.VITE_MILCIV_TYPE_MAP_JSON, 'VITE_MILCIV_TYPE_MAP_JSON'),
  gender: parseChoiceMap(process.env.VITE_GENDER_MAP_JSON, 'VITE_GENDER_MAP_JSON'),
  transportStatus: parseChoiceMap(process.env.VITE_TRANSPORT_REQUEST_STATUS_JSON, 'VITE_TRANSPORT_REQUEST_STATUS_JSON'),
}

let cachedToken = ''
let cachedTokenExpiresAt = 0

const server = createServer(async (req, res) => {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, { ok: true })
    return
  }

  if (req.method === 'POST' && req.url === '/api/external-onboarding/contacts') {
    try {
      const body = await readJsonBody(req)
      const email = toString(body.email).trim().toLowerCase()
      const firstName = toString(body.firstName).trim()
      const lastName = toString(body.lastName).trim()

      if (!email) {
        writeJson(res, 400, { error: 'Email is required.' })
        return
      }
      if (!firstName) {
        writeJson(res, 400, { error: 'First name is required.' })
        return
      }
      if (!lastName) {
        writeJson(res, 400, { error: 'Last name is required.' })
        return
      }

      const accessToken = await getAppAccessToken()
      const existing = await getContactByEmail(accessToken, email)

      if (existing) {
        writeJson(res, 200, { ...existing, created: false })
        return
      }

      const created = await createContact(accessToken, { email, firstName, lastName })
      writeJson(res, 201, { ...created, created: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown external onboarding API error'
      writeJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/external-onboarding/contacts/by-email')) {
    try {
      const requestUrl = new URL(req.url, `http://localhost:${port}`)
      const email = toString(requestUrl.searchParams.get('email')).trim().toLowerCase()
      if (!email) {
        writeJson(res, 400, { error: 'Email is required.' })
        return
      }

      const accessToken = await getAppAccessToken()
      const existing = await getContactByEmail(accessToken, email)

      writeJson(res, 200, {
        exists: Boolean(existing),
        contact: existing,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown external onboarding API error'
      writeJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'POST' && req.url === '/api/external-onboarding/passenger-requests') {
    try {
      const body = await readJsonBody(req)
      const payload = validatePassengerSubmissionBody(body)

      const accessToken = await getAppAccessToken()
      const submitResult = await createExternalPassengerRequests(accessToken, payload)

      writeJson(res, 201, submitResult)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown external passenger request error'
      writeJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'GET' && req.url === '/api/external-onboarding/passenger-lookups') {
    try {
      const accessToken = await getAppAccessToken()
      const payload = await loadExternalPassengerLookups(accessToken)
      writeJson(res, 200, payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown external lookup API error'
      writeJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'GET' && req.url === '/api/external-onboarding/passenger-lookups/debug') {
    try {
      const accessToken = await getAppAccessToken()
      const payload = await debugExternalPassengerLookups(accessToken)
      writeJson(res, 200, payload)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown external lookup debug API error'
      writeJson(res, 500, { error: message })
    }
    return
  }

  if (req.method === 'GET' && req.url?.startsWith('/api/external-onboarding/my-requests')) {
    try {
      const requestUrl = new URL(req.url, `http://localhost:${port}`)
      const email = toString(requestUrl.searchParams.get('email')).trim().toLowerCase()
      if (!email) {
        writeJson(res, 400, { error: 'Email is required.' })
        return
      }

      const accessToken = await getAppAccessToken()
      const rows = await listExternalPassengerRequestsByEmail(accessToken, email)
      writeJson(res, 200, { value: rows })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown external my-requests API error'
      writeJson(res, 500, { error: message })
    }
    return
  }

  writeJson(res, 404, { error: 'Not found' })
})

server.listen(port, () => {
  console.log(`External onboarding API listening on http://localhost:${port}`)
})

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

function toString(value) {
  return typeof value === 'string' ? value : ''
}

async function readJsonBody(req) {
  const chunks = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Invalid JSON body.')
  }
}

async function getAppAccessToken() {
  const now = Date.now()
  if (cachedToken && cachedTokenExpiresAt - now > 60_000) {
    return cachedToken
  }

  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: `${dataverseBase}/.default`,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Failed to acquire Dataverse app token (${response.status}). ${text}`)
  }

  const tokenResponse = await response.json()
  cachedToken = tokenResponse.access_token
  const expiresIn = Number(tokenResponse.expires_in || 3600)
  cachedTokenExpiresAt = now + expiresIn * 1000
  return cachedToken
}

async function getContactByEmail(accessToken, email) {
  const select = encodeURIComponent('contactid,emailaddress1,firstname,lastname')
  const filter = encodeURIComponent(`emailaddress1 eq '${escapeODataString(email)}'`)
  const url = `${dataverseBase}/api/data/v9.2/contacts?$select=${select}&$filter=${filter}&$top=1`

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Dataverse contact lookup failed (${response.status}). ${text}`)
  }

  const data = await response.json()
  const row = data?.value?.[0]
  if (!row) return null

  return {
    id: row.contactid,
    email: row.emailaddress1 || email,
    firstName: row.firstname || '',
    lastName: row.lastname || '',
  }
}

async function createContact(accessToken, payload) {
  const url = `${dataverseBase}/api/data/v9.2/contacts`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json; charset=utf-8',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      emailaddress1: payload.email,
      firstname: payload.firstName,
      lastname: payload.lastName,
      [passengerColumn]: true,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Dataverse contact create failed (${response.status}). ${text}`)
  }

  const json = await response.json().catch(() => ({}))
  const contactId = json.contactid || extractGuid(response.headers.get('OData-EntityId') || '')
  if (!contactId) throw new Error('Dataverse contact create succeeded but no contact ID was returned.')

  return {
    id: contactId,
    email: json.emailaddress1 || payload.email,
    firstName: json.firstname || payload.firstName,
    lastName: json.lastname || payload.lastName,
  }
}

function escapeODataString(value) {
  return value.replace(/'/g, "''")
}

function normalizePrefix(value) {
  return value.endsWith('_') ? value : `${value}_`
}

function extractGuid(value) {
  const match = value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match?.[0]
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function loadDotEnv() {
  const dotEnvPath = resolve(process.cwd(), '.env')
  if (!existsSync(dotEnvPath)) return

  const content = readFileSync(dotEnvPath, 'utf-8')
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function parseChoiceMap(raw, envName) {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    throw new Error(`${envName} must be valid JSON`)
  }
}

function toIsoDateTime(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date/time value: ${value}`)
  return d.toISOString()
}

function normalizeLookupId(value) {
  const input = toString(value).replace(/[{}]/g, '').trim()
  const match = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match?.[0]?.toLowerCase() || ''
}

function mapChoiceValue(map, label, fieldName) {
  const value = map[toString(label)]
  if (typeof value !== 'number') {
    throw new Error(`Unknown ${fieldName} label: ${label}`)
  }
  return value
}

function getChoiceLabel(map, numericValue) {
  const target = Number(numericValue)
  if (Number.isNaN(target)) return undefined
  const pair = Object.entries(map).find(([, value]) => Number(value) === target)
  return pair?.[0]
}

function validatePassengerSubmissionBody(body) {
  const email = toString(body.email).trim().toLowerCase()
  if (!email) throw new Error('Email is required for external passenger submission.')

  const shared = body.shared && typeof body.shared === 'object' ? body.shared : null
  if (!shared) throw new Error('Missing shared payload.')

  const fromId = normalizeLookupId(shared.fromId)
  const toId = normalizeLookupId(shared.toId)
  const authoriserId = normalizeLookupId(shared.authoriserId)
  const departingOn = toString(shared.departingOn)
  const returningOn = toString(shared.returningOn)

  if (!fromId || !toId || !authoriserId) {
    throw new Error('From, To and Authoriser are required.')
  }

  const passengers = Array.isArray(body.passengers) ? body.passengers : []
  if (passengers.length === 0) throw new Error('At least one passenger is required.')

  return {
    email,
    shared: {
      fromId,
      toId,
      authoriserId,
      departingOn,
      returningOn,
    },
    passengers,
  }
}

async function dataverseFetchJson(accessToken, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'OData-MaxVersion': '4.0',
      'OData-Version': '4.0',
      ...(options.headers || {}),
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Dataverse request failed (${response.status}). ${text}`)
  }

  if (response.status === 204) return {}
  return await response.json().catch(() => ({}))
}

async function listLookupOptions(accessToken, entitySetWithoutPrefix) {
  const fullEntitySet = `${solutionPrefix}${entitySetWithoutPrefix}`
  const idField = `${fullEntitySet.replace(/ies$/i, 'y').replace(/s$/i, '')}id`

  const nameCandidates = (() => {
    const key = entitySetWithoutPrefix.trim().toLowerCase()
    if (key === 'countries') return ['countrynamelong', 'country', 'name']
    if (key === 'authorisers') return ['name', 'displayname', 'authorisername']
    return ['name']
  })().map((column) => `${solutionPrefix}${column}`)

  for (const nameCol of nameCandidates) {
    try {
      const url = `${dataverseBase}/api/data/v9.2/${fullEntitySet}?$select=${encodeURIComponent(`${idField},${nameCol}`)}&$top=5000`
      const data = await dataverseFetchJson(accessToken, url)
      const options = (Array.isArray(data.value) ? data.value : [])
        .map((row) => {
          const id = normalizeLookupId(row[idField] || extractGuid(row['@odata.id'] || ''))
          const name = toString(row[nameCol]).trim()
          if (!id || !name) return null
          return { id, name }
        })
        .filter(Boolean)
      if (options.length > 0) return options
    } catch {
      continue
    }
  }

  const fallbackUrl = `${dataverseBase}/api/data/v9.2/${fullEntitySet}?$top=5000`
  const fallbackData = await dataverseFetchJson(accessToken, fallbackUrl)
  const rows = Array.isArray(fallbackData.value) ? fallbackData.value : []
  return rows
    .map((row) => {
      const id = normalizeLookupId(
        row[idField] ||
          Object.entries(row).find(([key, value]) => /id$/i.test(key) && typeof value === 'string')?.[1] ||
          extractGuid(row['@odata.id'] || ''),
      )
      if (!id) return null

      const name = Object.entries(row).find(([key, value]) => {
        if (typeof value !== 'string') return false
        if (!value.trim()) return false
        if (key.startsWith('@') || key.includes('@')) return false
        if (/id$/i.test(key)) return false
        return true
      })?.[1]

      const text = toString(name).trim()
      if (!text) return null
      return { id, name: text }
    })
    .filter(Boolean)
}

async function loadExternalPassengerLookups(accessToken) {
  const [airports, countries, purposes, meals, disabilities, authorisers] = await Promise.all([
    listLookupOptions(accessToken, 'airports'),
    listLookupOptions(accessToken, 'countries'),
    listLookupOptions(accessToken, 'purposeoftravels'),
    listLookupOptions(accessToken, 'mealdietarytypes'),
    listLookupOptions(accessToken, 'disabilities'),
    listLookupOptions(accessToken, 'authorisers'),
  ])

  return {
    airports,
    countries,
    purposeoftravels: purposes,
    mealdietarytypes: meals,
    disabilities,
    authorisers,
  }
}

async function debugLookupOptions(accessToken, entitySetWithoutPrefix) {
  const fullEntitySet = `${solutionPrefix}${entitySetWithoutPrefix}`
  const idField = `${fullEntitySet.replace(/ies$/i, 'y').replace(/s$/i, '')}id`
  const nameCandidates = (() => {
    const key = entitySetWithoutPrefix.trim().toLowerCase()
    if (key === 'countries') return ['countrynamelong', 'country', 'name']
    if (key === 'authorisers') return ['name', 'displayname', 'authorisername']
    return ['name']
  })().map((column) => `${solutionPrefix}${column}`)

  const attempts = []
  let sample = []

  for (const nameCol of nameCandidates) {
    const url = `${dataverseBase}/api/data/v9.2/${fullEntitySet}?$select=${encodeURIComponent(`${idField},${nameCol}`)}&$top=5`
    try {
      const data = await dataverseFetchJson(accessToken, url)
      const rows = Array.isArray(data.value) ? data.value : []
      attempts.push({ nameCol, ok: true, rowCount: rows.length })
      if (!sample.length && rows.length > 0) {
        sample = rows.map((row) => ({
          id: toString(row[idField]) || extractGuid(toString(row['@odata.id'])) || '',
          name: toString(row[nameCol]),
          keys: Object.keys(row),
        }))
      }
    } catch (error) {
      attempts.push({
        nameCol,
        ok: false,
        error: error instanceof Error ? error.message : 'Lookup query failed',
      })
    }
  }

  const options = await listLookupOptions(accessToken, entitySetWithoutPrefix)
  return {
    entitySet: fullEntitySet,
    idField,
    nameCandidates,
    optionsCount: options.length,
    attempts,
    sample,
  }
}

async function debugExternalPassengerLookups(accessToken) {
  const targets = ['airports', 'countries', 'purposeoftravels', 'mealdietarytypes', 'disabilities', 'authorisers']
  const results = {}

  for (const target of targets) {
    results[target] = await debugLookupOptions(accessToken, target)
  }

  return {
    dataverseBase,
    solutionPrefix,
    results,
  }
}

async function listExternalPassengerRequestsByEmail(accessToken, email) {
  const contact = await getContactByEmail(accessToken, email)
  if (!contact?.id) return []

  const entitySet = entitySetPassenger
  const idField = `${solutionPrefix}paxdetailid`
  const surnameCol = `${solutionPrefix}surname`
  const forenamesCol = `${solutionPrefix}forenames`
  const fromLookupCol = `_${solutionPrefix}from_value`
  const toLookupCol = `_${solutionPrefix}to_value`
  const departingOnCol = `${solutionPrefix}departingon`
  const returningOnCol = `${solutionPrefix}returningon`
  const statusCol = `${solutionPrefix}transportrequeststatus`
  const emailOfTravellerCol = `${solutionPrefix}emailoftraveller`
  const statusFormattedKey = `${statusCol}@OData.Community.Display.V1.FormattedValue`
  const fromFormattedKey = `${fromLookupCol}@OData.Community.Display.V1.FormattedValue`
  const toFormattedKey = `${toLookupCol}@OData.Community.Display.V1.FormattedValue`

  const filter = encodeURIComponent(`${emailOfTravellerCol} eq '${escapeODataString(email)}'`)
  const select = encodeURIComponent(
    `${idField},${surnameCol},${forenamesCol},${fromLookupCol},${toLookupCol},${departingOnCol},${returningOnCol},${statusCol},${emailOfTravellerCol},createdon`,
  )
  const orderBy = encodeURIComponent('createdon desc')
  const url = `${dataverseBase}/api/data/v9.2/${entitySet}?$select=${select}&$filter=${filter}&$orderby=${orderBy}`

  const data = await dataverseFetchJson(accessToken, url)
  const rows = Array.isArray(data.value) ? data.value : []

  return rows.map((row) => ({
    id: toString(row['@odata.id']) || toString(row[idField]) || undefined,
    odataId: toString(row['@odata.id']) || undefined,
    surname: toString(row[surnameCol]) || undefined,
    forenames: toString(row[forenamesCol]) || undefined,
    departingFromIata: toString(row[fromFormattedKey]) || toString(row[fromLookupCol]) || undefined,
    destinationIata: toString(row[toFormattedKey]) || toString(row[toLookupCol]) || undefined,
    transportRequestStatusLabel:
      toString(row[statusFormattedKey]) || getChoiceLabel(choiceMaps.transportStatus, row[statusCol]) || undefined,
    departingOn: toString(row[departingOnCol]) || undefined,
    returningOn: toString(row[returningOnCol]) || undefined,
    createdOn: toString(row.createdon) || undefined,
  }))
}

async function getReferenceName(accessToken, entitySet, recordId) {
  const cleanId = normalizeLookupId(recordId)
  if (!cleanId) return ''
  const nameCol = `${solutionPrefix}name`
  const url = `${dataverseBase}/api/data/v9.2/${entitySet}(${cleanId})?$select=${encodeURIComponent(nameCol)}`
  const data = await dataverseFetchJson(accessToken, url)
  return typeof data[nameCol] === 'string' ? data[nameCol] : ''
}

async function createExternalPassengerRequests(accessToken, payload) {
  const contact = await getContactByEmail(accessToken, payload.email)
  if (!contact?.id) {
    throw new Error('External contact not found. Complete onboarding before submitting requests.')
  }

  let groupId = ''
  let groupName = ''
  if (payload.passengers.length > 1) {
    const leadPassenger = payload.passengers[0] || {}
    const leadName = `${toString(leadPassenger.forenames)} ${toString(leadPassenger.surname)}`.trim() || 'External passenger'
    const candidateGroupName = `${leadName} +${payload.passengers.length - 1}`

    const groupBody = {
      [`${solutionPrefix}groupname`]: candidateGroupName,
      [`${solutionPrefix}passengercount`]: payload.passengers.length,
      [`${solutionPrefix}Authoriser@odata.bind`]: `/${entitySetAuthoriser}(${payload.shared.authoriserId})`,
    }

    const groupUrl = `${dataverseBase}/api/data/v9.2/${entitySetGroup}`
    const groupResponse = await fetch(groupUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(groupBody),
    })
    if (!groupResponse.ok) {
      const text = await groupResponse.text().catch(() => '')
      throw new Error(`Failed to create passenger group (${groupResponse.status}). ${text}`)
    }

    const groupJson = await groupResponse.json().catch(() => ({}))
    groupId = normalizeLookupId(groupJson[`${solutionPrefix}groupid`] || groupJson.id || extractGuid(groupResponse.headers.get('OData-EntityId') || ''))
    groupName = candidateGroupName
  }

  const passengerReferences = []

  for (const passenger of payload.passengers) {
    const surname = toString(passenger.surname).trim()
    const forenames = toString(passenger.forenames).trim()
    const documentTypeLabel = toString(passenger.documentTypeLabel || 'Passport')
    const documentNumber = toString(passenger.documentNumber).trim()
    const militaryCivilianLabel = toString(passenger.militaryCivilianLabel).trim()
    const genderLabel = toString(passenger.genderLabel).trim()

    const nationalityId = normalizeLookupId(passenger.nationalityId)
    const passportCountryOfIssueId = normalizeLookupId(passenger.passportCountryOfIssueId)
    const visaCountryOfIssueId = normalizeLookupId(passenger.visaCountryOfIssueId)
    const purposeOfTravelId = normalizeLookupId(passenger.purposeOfTravelId)
    const mealDietaryId = normalizeLookupId(passenger.mealDietaryId)
    const disabilityId = normalizeLookupId(passenger.disabilityId)

    if (!surname || !forenames || !documentNumber || !nationalityId || !purposeOfTravelId) {
      throw new Error('Passenger payload is missing required fields.')
    }

    const body = {
      [`${solutionPrefix}surname`]: surname,
      [`${solutionPrefix}forenames`]: forenames,
      [`${solutionPrefix}documenttype`]: mapChoiceValue(choiceMaps.documentType, documentTypeLabel, 'document type'),
      [`${solutionPrefix}documentnumber`]: documentNumber,
      [`${solutionPrefix}departingon`]: toIsoDateTime(payload.shared.departingOn),
      [`${solutionPrefix}returningon`]: toIsoDateTime(payload.shared.returningOn),
      [`${solutionPrefix}transportrequeststatus`]: mapChoiceValue(choiceMaps.transportStatus, 'Submitted', 'transport status'),
      ...(militaryCivilianLabel ? { [`${solutionPrefix}militarycivilian`]: mapChoiceValue(choiceMaps.militaryCivilian, militaryCivilianLabel, 'military/civilian') } : {}),
      ...(genderLabel ? { [`${solutionPrefix}gender`]: mapChoiceValue(choiceMaps.gender, genderLabel, 'gender') } : {}),
      ...(passenger.dateOfBirth ? { [`${solutionPrefix}dateofbirth`]: toString(passenger.dateOfBirth) } : {}),
      ...(passenger.serviceStaffNumber ? { [`${solutionPrefix}servicestaffnumber`]: toString(passenger.serviceStaffNumber) } : {}),
      ...(passenger.passportNumber ? { [`${solutionPrefix}passportnumber`]: toString(passenger.passportNumber) } : {}),
      ...(passenger.passportIssueDate ? { [`${solutionPrefix}passportissuedate`]: toString(passenger.passportIssueDate) } : {}),
      ...(passenger.passportExpiryDate ? { [`${solutionPrefix}passportexpirydate`]: toString(passenger.passportExpiryDate) } : {}),
      ...(passenger.visaNumber ? { [`${solutionPrefix}visanumber`]: toString(passenger.visaNumber) } : {}),
      ...(passenger.visaIssueDate ? { [`${solutionPrefix}visaissuedate`]: toString(passenger.visaIssueDate) } : {}),
      ...(passenger.visaExpiryDate ? { [`${solutionPrefix}visaexpirydate`]: toString(passenger.visaExpiryDate) } : {}),
      ...(passenger.mealDetails ? { [`${solutionPrefix}mealdetails`]: toString(passenger.mealDetails) } : {}),
      ...(passenger.amed !== undefined ? { [`${solutionPrefix}amed`]: Boolean(passenger.amed) } : {}),
      ...(passenger.amedDetails ? { [`${solutionPrefix}ameddetails`]: toString(passenger.amedDetails) } : {}),
      ...(passenger.allergy !== undefined ? { [`${solutionPrefix}allergy`]: Boolean(passenger.allergy) } : {}),
      ...(passenger.allergyDetails ? { [`${solutionPrefix}allergydetails`]: toString(passenger.allergyDetails) } : {}),
      ...(passenger.severity ? { [`${solutionPrefix}severity`]: toString(passenger.severity) } : {}),
      ...(passenger.specialRequests ? { [`${solutionPrefix}specialrequests`]: toString(passenger.specialRequests) } : {}),
      ...(passenger.pointOfContactName ? { [`${solutionPrefix}pointofcontactname`]: toString(passenger.pointOfContactName) } : {}),
      ...(passenger.contactEmailAddress ? { [`${solutionPrefix}contactemailaddress`]: toString(passenger.contactEmailAddress) } : {}),
      ...(passenger.contactNumberWorkingHours ? { [`${solutionPrefix}contactnumberworkinghours`]: toString(passenger.contactNumberWorkingHours) } : {}),
      ...(passenger.contactNumberOutOfHours ? { [`${solutionPrefix}contactnumberoutofhours`]: toString(passenger.contactNumberOutOfHours) } : {}),
      ...(passenger.emergencyContactNumber ? { [`${solutionPrefix}emergencycontactnumber`]: toString(passenger.emergencyContactNumber) } : {}),
      ...(passenger.paxPhoneNumber ? { [`${solutionPrefix}paxphonenumber`]: toString(passenger.paxPhoneNumber) } : {}),
      [`${solutionPrefix}emailoftraveller`]: toString(passenger.emailOfTraveller).trim() || payload.email,
      [`${solutionPrefix}From@odata.bind`]: `/${solutionPrefix}airports(${payload.shared.fromId})`,
      [`${solutionPrefix}To@odata.bind`]: `/${solutionPrefix}airports(${payload.shared.toId})`,
      [`${solutionPrefix}Authoriser@odata.bind`]: `/${entitySetAuthoriser}(${payload.shared.authoriserId})`,
      [`${solutionPrefix}Nationality@odata.bind`]: `/${solutionPrefix}countries(${nationalityId})`,
      [`${solutionPrefix}PassportCountryofIssue@odata.bind`]: `/${solutionPrefix}countries(${passportCountryOfIssueId})`,
      [`${solutionPrefix}VisaCountryofIssue@odata.bind`]: `/${solutionPrefix}countries(${visaCountryOfIssueId})`,
      [`${solutionPrefix}PurposeofTravel@odata.bind`]: `/${solutionPrefix}purposeoftravels(${purposeOfTravelId})`,
      ...(mealDietaryId ? { [`${solutionPrefix}MealDietary@odata.bind`]: `/${solutionPrefix}mealdietarytypes(${mealDietaryId})` } : {}),
      ...(disabilityId ? { [`${solutionPrefix}Disability@odata.bind`]: `/${solutionPrefix}disabilities(${disabilityId})` } : {}),
      ...(groupId ? { [`${solutionPrefix}Group@odata.bind`]: `/${entitySetGroup}(${groupId})` } : {}),
    }

    const passengerUrl = `${dataverseBase}/api/data/v9.2/${entitySetPassenger}`
    const response = await fetch(passengerUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
        'OData-MaxVersion': '4.0',
        'OData-Version': '4.0',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(`Failed to create passenger request (${response.status}). ${text}`)
    }

    const entityId = response.headers.get('OData-EntityId') || ''
    const createdId = extractGuid(entityId)
    if (createdId) {
      const referenceName = await getReferenceName(accessToken, entitySetPassenger, createdId)
      if (referenceName) passengerReferences.push(referenceName)
    }
  }

  return {
    passengerReferences,
    groupName: groupName || undefined,
  }
}
