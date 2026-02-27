import { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { env } from '../config'
import { DataverseClient } from '../dataverse/dataverseClient'
import type { LookupOption, PassengerRequest } from '../dataverse/types'
import { LookupAutocompleteInput } from '../ui/LookupAutocompleteInput'
import { useAuthz } from '../authz/useAuthz'
import { canCreateRequest } from '../authz/authz'
import { acquireDataverseAccessToken } from '../auth/dataverseToken'
import { getExternalSession, getRememberedExternalEmail } from '../auth/externalSession'

function nowDateTimeLocal(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

function isAfter(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getTime() > db.getTime()
}

const guidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const passportPattern = /\b\d{9}\b/

function normalizeGuid(value: string | undefined): string {
  const raw = (value ?? '').replace(/[{}]/g, '').trim()
  const match = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match?.[0] ?? raw
}

type Step = 'choose-count' | 'flight-requirements' | 'fill-passengers' | 'success'
type PassengerFormData = PassengerRequest & { isLeadPassenger: boolean }

type SubmissionResult = {
  passengerReferences: string[]
  groupName?: string
}

function parseOptionLabels(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Record<string, number>
    const labels = Object.keys(parsed)
    return labels.length > 0 ? labels : fallback
  } catch {
    return fallback
  }
}

function createEmptyPassenger(isLead: boolean): PassengerFormData {
  return {
    surname: '',
    forenames: '',
    serviceStaffNumber: '',
    militaryCivilianLabel: '',
    genderLabel: '',
    dateOfBirth: '',
    documentTypeLabel: 'Passport',
    documentNumber: '',
    passportNumber: '',
    passportIssueDate: '',
    passportExpiryDate: '',
    visaNumber: '',
    visaIssueDate: '',
    visaExpiryDate: '',
    nationalityId: '',
    passportCountryOfIssueId: '',
    visaCountryOfIssueId: '',
    purposeOfTravelId: '',
    fromId: '',
    toId: '',
    disabilityId: '',
    mealDietaryId: '',
    mealDetails: '',
    amed: undefined,
    amedDetails: '',
    allergy: undefined,
    allergyDetails: '',
    severity: '',
    specialRequests: '',
    pointOfContactName: '',
    contactEmailAddress: '',
    contactNumberWorkingHours: '',
    contactNumberOutOfHours: '',
    emergencyContactNumber: '',
    paxPhoneNumber: '',
    emailOfTraveller: '',
    departingOn: nowDateTimeLocal(),
    returningOn: nowDateTimeLocal(),
    departingFromIata: '',
    destinationIata: '',
    isLeadPassenger: isLead,
  }
}

export function PassengerRequestPage() {
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const authz = useAuthz()
  const canSubmit = account ? canCreateRequest(authz.roles) : false

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => await acquireDataverseAccessToken(instance, acct),
    })
  }, [instance])

  const [step, setStep] = useState<Step>('choose-count')
  const [passengerCountChoice, setPassengerCountChoice] = useState<'one' | 'multiple' | null>(null)
  const [passengerCount, setPassengerCount] = useState(2)
  const [passengers, setPassengers] = useState<PassengerFormData[]>([createEmptyPassenger(true)])
  const [currentPassengerIndex, setCurrentPassengerIndex] = useState(0)

  const [sharedFromId, setSharedFromId] = useState('')
  const [sharedToId, setSharedToId] = useState('')
  const [sharedAuthoriserId, setSharedAuthoriserId] = useState('')
  const [sharedDepartingOn, setSharedDepartingOn] = useState(nowDateTimeLocal())
  const [hasReturnDate, setHasReturnDate] = useState<boolean | null>(null)
  const [sharedReturningOn, setSharedReturningOn] = useState(nowDateTimeLocal())

  const militaryOptions = useMemo(
    () => parseOptionLabels(env.milCivTypeMapJson, ['Military', 'Civilian']),
    [],
  )
  const genderOptions = useMemo(
    () => parseOptionLabels(env.genderMapJson, ['Male', 'Female', 'Undisclosed']),
    [],
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookupLoadError, setLookupLoadError] = useState<string | null>(null)
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null)
  const [airportOptions, setAirportOptions] = useState<LookupOption[]>([])
  const [countryOptions, setCountryOptions] = useState<LookupOption[]>([])
  const [purposeOptions, setPurposeOptions] = useState<LookupOption[]>([])
  const [mealOptions, setMealOptions] = useState<LookupOption[]>([])
  const [disabilityOptions, setDisabilityOptions] = useState<LookupOption[]>([])
  const [authoriserOptions, setAuthoriserOptions] = useState<LookupOption[]>([])
  const externalApiBase = useMemo(() => env.externalOnboardingApiBaseUrl.replace(/\/$/, ''), [])

  const currentPassenger = passengers[currentPassengerIndex]

  useEffect(() => {
    let cancelled = false

    async function loadLookupOptions() {
      const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
      if (env.useMock) return

      try {
        if (authz.isExternalUser) {
          const response = await fetch(`${externalApiBase}/api/external-onboarding/passenger-lookups`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })

          if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(text || `Failed to load lookup options (${response.status})`)
          }

          const payload = (await response.json().catch(() => ({}))) as {
            airports?: LookupOption[]
            countries?: LookupOption[]
            purposeoftravels?: LookupOption[]
            mealdietarytypes?: LookupOption[]
            disabilities?: LookupOption[]
            authorisers?: LookupOption[]
          }

          if (cancelled) return

          setAirportOptions(Array.isArray(payload.airports) ? payload.airports : [])
          setCountryOptions(Array.isArray(payload.countries) ? payload.countries : [])
          setPurposeOptions(Array.isArray(payload.purposeoftravels) ? payload.purposeoftravels : [])
          setMealOptions(Array.isArray(payload.mealdietarytypes) ? payload.mealdietarytypes : [])
          setDisabilityOptions(Array.isArray(payload.disabilities) ? payload.disabilities : [])
          setAuthoriserOptions(Array.isArray(payload.authorisers) ? payload.authorisers : [])

          const totalCount =
            (Array.isArray(payload.airports) ? payload.airports.length : 0) +
            (Array.isArray(payload.countries) ? payload.countries.length : 0) +
            (Array.isArray(payload.purposeoftravels) ? payload.purposeoftravels.length : 0) +
            (Array.isArray(payload.mealdietarytypes) ? payload.mealdietarytypes.length : 0) +
            (Array.isArray(payload.disabilities) ? payload.disabilities.length : 0) +
            (Array.isArray(payload.authorisers) ? payload.authorisers.length : 0)

          setLookupLoadError(
            totalCount === 0
              ? 'Lookup lists returned no rows from Dataverse. Verify static data exists and the external onboarding app user has Read access to lookup tables.'
              : null,
          )
          return
        }

        if (!acct) return
        const [airports, countries, purposes, meals, disabilities, authorisers] = await Promise.allSettled([
          client.listLookupOptions(acct, 'airports'),
          client.listLookupOptions(acct, 'countries'),
          client.listLookupOptions(acct, 'purposeoftravels'),
          client.listLookupOptions(acct, 'mealdietarytypes'),
          client.listLookupOptions(acct, 'disabilities'),
          client.listLookupOptions(acct, env.dataverseEntitySetAuthoriser),
        ])
        if (cancelled) return
        setAirportOptions(airports.status === 'fulfilled' ? airports.value : [])
        setCountryOptions(countries.status === 'fulfilled' ? countries.value : [])
        setPurposeOptions(purposes.status === 'fulfilled' ? purposes.value : [])
        setMealOptions(meals.status === 'fulfilled' ? meals.value : [])
        setDisabilityOptions(disabilities.status === 'fulfilled' ? disabilities.value : [])
        setAuthoriserOptions(authorisers.status === 'fulfilled' ? authorisers.value : [])

        const failures = [airports, countries, purposes, meals, disabilities, authorisers]
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => (r.reason instanceof Error ? r.reason.message : 'Failed to load one lookup list'))
        setLookupLoadError(failures.length > 0 ? failures.join(' | ') : null)
      } catch (e) {
        if (cancelled) return
        setLookupLoadError(e instanceof Error ? e.message : 'Failed to load lookup options')
      }
    }

    void loadLookupOptions()
    return () => {
      cancelled = true
    }
  }, [instance, accounts, client, authz.isExternalUser, externalApiBase])

  function resolveExternalEmail(): string {
    const externalSession = getExternalSession()
    const accountClaims = (account?.idTokenClaims ?? {}) as Record<string, unknown>
    const claimEmail = Array.isArray(accountClaims.emails) ? accountClaims.emails[0] : accountClaims.email

    const options = [
      externalSession?.email,
      getRememberedExternalEmail(),
      account?.username,
      typeof claimEmail === 'string' ? claimEmail : '',
      typeof accountClaims.preferred_username === 'string' ? accountClaims.preferred_username : '',
    ]

    for (const value of options) {
      const normalized = typeof value === 'string' ? value.trim().toLowerCase() : ''
      if (normalized.includes('@')) return normalized
    }

    return ''
  }

  function updateCurrentPassenger(updates: Partial<PassengerFormData>) {
    setPassengers((prev) => {
      const updated = [...prev]
      updated[currentPassengerIndex] = { ...updated[currentPassengerIndex], ...updates }
      return updated
    })
  }

  function handleCountContinue() {
    setError(null)
    if (!passengerCountChoice) return

    if (passengerCountChoice === 'one') {
      setPassengers([createEmptyPassenger(true)])
    } else {
      const list: PassengerFormData[] = []
      for (let i = 0; i < passengerCount; i++) list.push(createEmptyPassenger(i === 0))
      setPassengers(list)
    }

    setCurrentPassengerIndex(0)
    setStep('flight-requirements')
  }

  function handleFlightContinue() {
    setError(null)

    if (!sharedFromId || !sharedToId) {
      setError('Please select both From airport and To airport.')
      return
    }

    if (!sharedAuthoriserId) {
      setError('Please select an Authoriser.')
      return
    }

    if (hasReturnDate === null) {
      setError('Please answer whether you want to provide a return date.')
      return
    }

    if (hasReturnDate && !isAfter(sharedReturningOn, sharedDepartingOn)) {
      setError('Returning on must be later than Departing on.')
      return
    }

    setStep('fill-passengers')
  }

  function validatePassenger(p: PassengerFormData, index: number): string | null {
    const requiredTextFields: Array<[keyof PassengerFormData, string]> = [
      ['surname', 'Surname'],
      ['forenames', 'Forenames'],
      ['serviceStaffNumber', 'Service staff number'],
      ['militaryCivilianLabel', 'Military/Civilian'],
      ['genderLabel', 'Gender'],
      ['dateOfBirth', 'Date of birth'],
      ['nationalityId', 'Nationality'],
      ['purposeOfTravelId', 'Purpose of travel'],
      ['emailOfTraveller', 'Traveller email'],
      ['contactNumberWorkingHours', 'Contact number (working hours)'],
      ['contactNumberOutOfHours', 'Contact number (out of hours)'],
      ['emergencyContactNumber', 'Emergency contact number'],
      ['paxPhoneNumber', 'Passenger phone number'],
      ['documentNumber', 'Document number'],
      ['passportNumber', 'Passport number'],
      ['passportIssueDate', 'Passport issue date'],
      ['passportExpiryDate', 'Passport expiry date'],
      ['passportCountryOfIssueId', 'Passport country of issue'],
      ['visaNumber', 'Visa number'],
      ['visaIssueDate', 'Visa issue date'],
      ['visaExpiryDate', 'Visa expiry date'],
      ['visaCountryOfIssueId', 'Visa country of issue'],
    ]

    for (const [field, label] of requiredTextFields) {
      const value = p[field]
      if (typeof value !== 'string' || value.trim().length === 0) {
        return `Passenger ${index + 1}: ${label} is required.`
      }
    }

    if (p.amed === undefined) return `Passenger ${index + 1}: AMED is required.`
    if (p.allergy === undefined) return `Passenger ${index + 1}: Allergy is required.`
    if (p.amed && !p.amedDetails?.trim()) return `Passenger ${index + 1}: AMED details are required.`

    if (p.mealDietaryId && p.mealDietaryId.trim().length > 0 && !p.mealDetails?.trim()) {
      return `Passenger ${index + 1}: Meal details are required when Meal/Dietary has a value.`
    }

    if (p.passportNumber && !passportPattern.test(p.passportNumber)) {
      return `Passenger ${index + 1}: Passport number must match pattern \\b\\d{9}\\b.`
    }

    const guidFields: Array<[keyof PassengerFormData, string, boolean]> = [
      ['nationalityId', 'Nationality', true],
      ['passportCountryOfIssueId', 'Passport country of issue', true],
      ['visaCountryOfIssueId', 'Visa country of issue', true],
      ['purposeOfTravelId', 'Purpose of travel', true],
      ['mealDietaryId', 'Meal/Dietary', false],
      ['disabilityId', 'Disability', false],
    ]

    for (const [field, label, required] of guidFields) {
      const value = p[field]
      const raw = normalizeGuid(typeof value === 'string' ? value : '')
      if (!raw) {
        if (required) return `Passenger ${index + 1}: ${label} is required.`
        continue
      }
      if (!guidPattern.test(raw)) {
        return `Passenger ${index + 1}: ${label} must be a valid GUID.`
      }
    }

    if (p.passportIssueDate && p.passportExpiryDate) {
      if (!isAfter(`${p.passportExpiryDate}T23:59`, `${p.passportIssueDate}T00:00`)) {
        return `Passenger ${index + 1}: Passport expiry date must be after passport issue date.`
      }
    }

    if (p.visaIssueDate && p.visaExpiryDate) {
      if (!isAfter(`${p.visaExpiryDate}T23:59`, `${p.visaIssueDate}T00:00`)) {
        return `Passenger ${index + 1}: Visa expiry date must be after visa issue date.`
      }
    }

    return null
  }

  function handleNextPassenger() {
    setError(null)
    const schemaError = validatePassenger(currentPassenger, currentPassengerIndex)
    if (schemaError) {
      setError(schemaError)
      return
    }

    if (currentPassengerIndex < passengers.length - 1) {
      setCurrentPassengerIndex((i) => i + 1)
    }
  }

  async function handleSubmitAll() {
    setError(null)

    if (!account) {
      setError('You must be signed in to submit requests.')
      return
    }

    if (!canSubmit) {
      setError('You do not have permission to raise a passenger request.')
      return
    }

    for (let i = 0; i < passengers.length; i++) {
      const err = validatePassenger(passengers[i], i)
      if (err) {
        setError(err)
        setCurrentPassengerIndex(i)
        return
      }
    }

    const fromName = airportOptions.find((a) => a.id === sharedFromId)?.name ?? ''
    const toName = airportOptions.find((a) => a.id === sharedToId)?.name ?? ''
    const finalReturningOn = hasReturnDate ? sharedReturningOn : sharedDepartingOn

    try {
      setBusy(true)

      if (authz.isExternalUser) {
        const email = resolveExternalEmail()
        if (!email) {
          throw new Error('Unable to resolve external email. Please sign in again and retry.')
        }

        const externalResponse = await fetch(`${externalApiBase}/api/external-onboarding/passenger-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            email,
            shared: {
              fromId: normalizeGuid(sharedFromId),
              toId: normalizeGuid(sharedToId),
              authoriserId: normalizeGuid(sharedAuthoriserId),
              departingOn: sharedDepartingOn,
              returningOn: finalReturningOn,
            },
            passengers: passengers.map((passenger) => ({
              ...passenger,
              nationalityId: normalizeGuid(passenger.nationalityId),
              passportCountryOfIssueId: normalizeGuid(passenger.passportCountryOfIssueId),
              visaCountryOfIssueId: normalizeGuid(passenger.visaCountryOfIssueId),
              purposeOfTravelId: normalizeGuid(passenger.purposeOfTravelId),
              mealDietaryId: normalizeGuid(passenger.mealDietaryId),
              disabilityId: normalizeGuid(passenger.disabilityId),
              departingFromIata: fromName,
              destinationIata: toName,
            })),
          }),
        })

        if (!externalResponse.ok) {
          const text = await externalResponse.text().catch(() => '')
          throw new Error(text || `External passenger submission failed (${externalResponse.status})`)
        }

        const externalResult = (await externalResponse.json().catch(() => ({}))) as SubmissionResult
        setSubmissionResult({
          passengerReferences: Array.isArray(externalResult.passengerReferences) ? externalResult.passengerReferences : [],
          groupName: externalResult.groupName,
        })
      } else {
        const leadPassenger = passengers.find((p) => p.isLeadPassenger) ?? passengers[0]
        const leadName = `${leadPassenger.forenames} ${leadPassenger.surname}`.trim()

        let groupId: string | undefined
        let groupName: string | undefined

        if (passengers.length > 1) {
          const groupResult = await client.createPaxGroup(account, leadName, passengers.length, normalizeGuid(sharedAuthoriserId))
          groupId = groupResult.id
          groupName = groupResult.groupName
        }

        const passengerReferences: string[] = []
        for (const passenger of passengers) {
          const payload: PassengerRequest = {
            ...passenger,
            nationalityId: normalizeGuid(passenger.nationalityId),
            passportCountryOfIssueId: normalizeGuid(passenger.passportCountryOfIssueId),
            visaCountryOfIssueId: normalizeGuid(passenger.visaCountryOfIssueId),
            purposeOfTravelId: normalizeGuid(passenger.purposeOfTravelId),
            mealDietaryId: normalizeGuid(passenger.mealDietaryId),
            disabilityId: normalizeGuid(passenger.disabilityId),
            fromId: normalizeGuid(sharedFromId),
            toId: normalizeGuid(sharedToId),
            authoriserId: normalizeGuid(sharedAuthoriserId),
            departingOn: sharedDepartingOn,
            returningOn: finalReturningOn,
            departingFromIata: fromName,
            destinationIata: toName,
            transportRequestStatusLabel: 'Submitted',
            groupId,
          }

          const result = await client.createPassengerRequest(account, payload)
          if (result.referenceName) passengerReferences.push(result.referenceName)
        }

        setSubmissionResult({ passengerReferences, groupName })
      }

      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'success' && submissionResult) {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <div className="govuk-panel govuk-panel--confirmation">
            <h1 className="govuk-panel__title">Passenger request submitted</h1>
            <div className="govuk-panel__body">
              {submissionResult.groupName ? (
                <>Group booking: <strong>{submissionResult.groupName}</strong></>
              ) : (
                <>Passenger booking created</>
              )}
            </div>
          </div>

          <h2 className="govuk-heading-m govuk-!-margin-top-6">References</h2>
          <ul className="govuk-list govuk-list--bullet">
            {submissionResult.passengerReferences.length > 0 ? (
              submissionResult.passengerReferences.map((ref, idx) => <li key={`${ref}-${idx}`}>{ref}</li>)
            ) : (
              <li>No references returned by Dataverse.</li>
            )}
          </ul>

          <p className="govuk-body">
            <a href="/" className="govuk-link">Return to home</a>
          </p>
        </div>
      </div>
    )
  }

  if (step === 'choose-count') {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Raise a passenger request</h1>

          <div className="govuk-form-group">
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
                <h2 className="govuk-fieldset__heading">How many passengers do you need to add?</h2>
              </legend>
              <div className="govuk-radios" data-module="govuk-radios">
                <div className="govuk-radios__item">
                  <input
                    className="govuk-radios__input"
                    id="count-one"
                    name="passenger-count"
                    type="radio"
                    value="one"
                    checked={passengerCountChoice === 'one'}
                    onChange={() => setPassengerCountChoice('one')}
                  />
                  <label className="govuk-label govuk-radios__label" htmlFor="count-one">1 passenger</label>
                </div>
                <div className="govuk-radios__item">
                  <input
                    className="govuk-radios__input"
                    id="count-multiple"
                    name="passenger-count"
                    type="radio"
                    value="multiple"
                    checked={passengerCountChoice === 'multiple'}
                    onChange={() => setPassengerCountChoice('multiple')}
                  />
                  <label className="govuk-label govuk-radios__label" htmlFor="count-multiple">More than 1 passenger</label>
                </div>
              </div>
            </fieldset>
          </div>

          {passengerCountChoice === 'multiple' && (
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="passenger-count-select">How many passengers? (2-10)</label>
              <select
                className="govuk-select"
                id="passenger-count-select"
                value={passengerCount}
                onChange={(e) => setPassengerCount(Number(e.target.value))}
              >
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n} passengers</option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="govuk-error-message">{error}</p>
          )}

          <button
            type="button"
            className="govuk-button"
            data-module="govuk-button"
            disabled={!passengerCountChoice}
            onClick={handleCountContinue}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  if (step === 'flight-requirements') {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Flight requirements</h1>

          <LookupAutocompleteInput
            label="From airport"
            valueId={sharedFromId}
            options={airportOptions}
            required
            onChange={setSharedFromId}
          />

          <LookupAutocompleteInput
            label="To airport"
            valueId={sharedToId}
            options={airportOptions}
            required
            onChange={setSharedToId}
          />

          <LookupAutocompleteInput
            label="Authoriser"
            valueId={sharedAuthoriserId}
            options={authoriserOptions}
            required
            onChange={setSharedAuthoriserId}
          />

          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="shared-departing-on">Departing on</label>
            <input
              className="govuk-input"
              id="shared-departing-on"
              type="datetime-local"
              value={sharedDepartingOn}
              onChange={(e) => setSharedDepartingOn(e.target.value)}
            />
          </div>

          <div className="govuk-form-group">
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend">Do you want to provide a return date?</legend>
              <div className="govuk-radios" data-module="govuk-radios">
                <div className="govuk-radios__item">
                  <input
                    className="govuk-radios__input"
                    id="has-return-yes"
                    name="has-return"
                    type="radio"
                    checked={hasReturnDate === true}
                    onChange={() => setHasReturnDate(true)}
                  />
                  <label className="govuk-label govuk-radios__label" htmlFor="has-return-yes">Yes</label>
                </div>
                <div className="govuk-radios__item">
                  <input
                    className="govuk-radios__input"
                    id="has-return-no"
                    name="has-return"
                    type="radio"
                    checked={hasReturnDate === false}
                    onChange={() => setHasReturnDate(false)}
                  />
                  <label className="govuk-label govuk-radios__label" htmlFor="has-return-no">No</label>
                </div>
              </div>
            </fieldset>
          </div>

          {hasReturnDate && (
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="shared-returning-on">Returning on</label>
              <input
                className="govuk-input"
                id="shared-returning-on"
                type="datetime-local"
                value={sharedReturningOn}
                onChange={(e) => setSharedReturningOn(e.target.value)}
              />
            </div>
          )}

          {lookupLoadError && (
            <p className="govuk-error-message">Lookup options could not be fully loaded: {lookupLoadError}</p>
          )}

          {error && <p className="govuk-error-message">{error}</p>}

          <div className="govuk-button-group">
            <button type="button" className="govuk-button" data-module="govuk-button" onClick={handleFlightContinue}>
              Continue
            </button>
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              data-module="govuk-button"
              onClick={() => setStep('choose-count')}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Passenger {currentPassengerIndex + 1} of {passengers.length}</h1>

        <h2 className="govuk-heading-m">Section 1: Passenger details</h2>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="surname">Surname</label>
          <input className="govuk-input" id="surname" type="text" maxLength={850} value={currentPassenger.surname} onChange={(e) => updateCurrentPassenger({ surname: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="forenames">Forenames</label>
          <input className="govuk-input" id="forenames" type="text" maxLength={850} value={currentPassenger.forenames} onChange={(e) => updateCurrentPassenger({ forenames: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="service-staff-number">Service staff number</label>
          <input className="govuk-input" id="service-staff-number" type="text" maxLength={100} value={currentPassenger.serviceStaffNumber ?? ''} onChange={(e) => updateCurrentPassenger({ serviceStaffNumber: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="military-civilian">Military/Civilian</label>
          <select className="govuk-select" id="military-civilian" value={currentPassenger.militaryCivilianLabel ?? ''} onChange={(e) => updateCurrentPassenger({ militaryCivilianLabel: e.target.value })}>
            <option value="">Select</option>
            {militaryOptions.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="gender">Gender</label>
          <select className="govuk-select" id="gender" value={currentPassenger.genderLabel ?? ''} onChange={(e) => updateCurrentPassenger({ genderLabel: e.target.value })}>
            <option value="">Select</option>
            {genderOptions.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="date-of-birth">Date of birth</label>
          <input className="govuk-input" id="date-of-birth" type="date" value={currentPassenger.dateOfBirth ?? ''} onChange={(e) => updateCurrentPassenger({ dateOfBirth: e.target.value })} />
        </div>

        <LookupAutocompleteInput label="Nationality" valueId={currentPassenger.nationalityId} options={countryOptions} required onChange={(id) => updateCurrentPassenger({ nationalityId: id })} />
        <LookupAutocompleteInput label="Purpose of travel" valueId={currentPassenger.purposeOfTravelId} options={purposeOptions} required onChange={(id) => updateCurrentPassenger({ purposeOfTravelId: id })} />
        <LookupAutocompleteInput label="Meal / Dietary" valueId={currentPassenger.mealDietaryId} options={mealOptions} onChange={(id) => updateCurrentPassenger({ mealDietaryId: id })} />
        <LookupAutocompleteInput label="Disability" valueId={currentPassenger.disabilityId} options={disabilityOptions} onChange={(id) => updateCurrentPassenger({ disabilityId: id })} />

        {currentPassenger.mealDietaryId && currentPassenger.mealDietaryId.trim().length > 0 && (
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="meal-details">Meal details</label>
            <textarea className="govuk-textarea" id="meal-details" rows={4} maxLength={4000} value={currentPassenger.mealDetails ?? ''} onChange={(e) => updateCurrentPassenger({ mealDetails: e.target.value })} />
          </div>
        )}

        {([
          ['email-of-traveller', 'Traveller email', 'emailOfTraveller', 'email', 100],
          ['contact-number-working-hours', 'Contact number (working hours)', 'contactNumberWorkingHours', 'tel', 100],
          ['contact-number-out-of-hours', 'Contact number (out of hours)', 'contactNumberOutOfHours', 'tel', 100],
          ['emergency-contact-number', 'Emergency contact number', 'emergencyContactNumber', 'tel', 100],
          ['pax-phone-number', 'Passenger phone number', 'paxPhoneNumber', 'tel', 100],
        ] as Array<[string, string, keyof PassengerFormData, string, number]>).map(([id, label, key, type, max]) => (
          <div className="govuk-form-group" key={id}>
            <label className="govuk-label" htmlFor={id}>{label}</label>
            <input className="govuk-input" id={id} type={type} maxLength={max} value={(currentPassenger[key] as string | undefined) ?? ''} onChange={(e) => updateCurrentPassenger({ [key]: e.target.value } as Partial<PassengerFormData>)} />
          </div>
        ))}

        <h2 className="govuk-heading-m govuk-!-margin-top-6">Section 2: Documentation</h2>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="document-type">Document type</label>
          <select className="govuk-select" id="document-type" value={currentPassenger.documentTypeLabel} onChange={(e) => updateCurrentPassenger({ documentTypeLabel: e.target.value })}>
            <option value="Passport">Passport</option>
            <option value="Warrant Card">Warrant Card</option>
            <option value="ID Card">ID Card</option>
          </select>
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="document-number">Document number</label>
          <input className="govuk-input" id="document-number" type="text" maxLength={850} value={currentPassenger.documentNumber} onChange={(e) => updateCurrentPassenger({ documentNumber: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="passport-number">Passport number</label>
          <input className="govuk-input" id="passport-number" type="text" maxLength={9} pattern="\d{9}" value={currentPassenger.passportNumber ?? ''} onChange={(e) => updateCurrentPassenger({ passportNumber: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="passport-issue-date">Passport issue date</label>
          <input className="govuk-input" id="passport-issue-date" type="date" value={currentPassenger.passportIssueDate ?? ''} onChange={(e) => updateCurrentPassenger({ passportIssueDate: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="passport-expiry-date">Passport expiry date</label>
          <input className="govuk-input" id="passport-expiry-date" type="date" value={currentPassenger.passportExpiryDate ?? ''} onChange={(e) => updateCurrentPassenger({ passportExpiryDate: e.target.value })} />
        </div>

        <LookupAutocompleteInput label="Passport country of issue" valueId={currentPassenger.passportCountryOfIssueId} options={countryOptions} required onChange={(id) => updateCurrentPassenger({ passportCountryOfIssueId: id })} />

        <h2 className="govuk-heading-m govuk-!-margin-top-6">Section 3: Visa details</h2>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="visa-number">Visa number</label>
          <input className="govuk-input" id="visa-number" type="text" maxLength={100} value={currentPassenger.visaNumber ?? ''} onChange={(e) => updateCurrentPassenger({ visaNumber: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="visa-issue-date">Visa issue date</label>
          <input className="govuk-input" id="visa-issue-date" type="date" value={currentPassenger.visaIssueDate ?? ''} onChange={(e) => updateCurrentPassenger({ visaIssueDate: e.target.value })} />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="visa-expiry-date">Visa expiry date</label>
          <input className="govuk-input" id="visa-expiry-date" type="date" value={currentPassenger.visaExpiryDate ?? ''} onChange={(e) => updateCurrentPassenger({ visaExpiryDate: e.target.value })} />
        </div>

        <LookupAutocompleteInput label="Visa country of issue" valueId={currentPassenger.visaCountryOfIssueId} options={countryOptions} required onChange={(id) => updateCurrentPassenger({ visaCountryOfIssueId: id })} />

        <h2 className="govuk-heading-m govuk-!-margin-top-6">Section 4: AMED and allergy</h2>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="amed">AMED</label>
          <select
            className="govuk-select"
            id="amed"
            value={currentPassenger.amed === undefined ? '' : currentPassenger.amed ? 'yes' : 'no'}
            onChange={(e) => {
              const value = e.target.value
              updateCurrentPassenger({
                amed: value === '' ? undefined : value === 'yes',
                amedDetails: value === 'yes' ? currentPassenger.amedDetails : '',
              })
            }}
          >
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        {currentPassenger.amed && (
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="amed-details">AMED details</label>
            <textarea className="govuk-textarea" id="amed-details" rows={4} maxLength={4000} value={currentPassenger.amedDetails ?? ''} onChange={(e) => updateCurrentPassenger({ amedDetails: e.target.value })} />
          </div>
        )}

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="allergy">Allergy</label>
          <select
            className="govuk-select"
            id="allergy"
            value={currentPassenger.allergy === undefined ? '' : currentPassenger.allergy ? 'yes' : 'no'}
            onChange={(e) => {
              const value = e.target.value
              updateCurrentPassenger({
                allergy: value === '' ? undefined : value === 'yes',
                allergyDetails: value === 'yes' ? currentPassenger.allergyDetails : '',
              })
            }}
          >
            <option value="">Select</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        {currentPassenger.allergy && (
          <div className="govuk-form-group">
            <label className="govuk-label" htmlFor="allergy-details">Allergy details</label>
            <textarea className="govuk-textarea" id="allergy-details" rows={4} maxLength={4000} value={currentPassenger.allergyDetails ?? ''} onChange={(e) => updateCurrentPassenger({ allergyDetails: e.target.value })} />
          </div>
        )}

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="severity">Severity</label>
          <textarea className="govuk-textarea" id="severity" rows={3} maxLength={4000} value={currentPassenger.severity ?? ''} onChange={(e) => updateCurrentPassenger({ severity: e.target.value })} />
        </div>

        {lookupLoadError && (
          <p className="govuk-error-message">Lookup options could not be fully loaded: {lookupLoadError}</p>
        )}

        {error && (
          <div className="govuk-error-summary" data-module="govuk-error-summary">
            <div role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <div className="govuk-error-summary__body">
                <ul className="govuk-list govuk-error-summary__list">
                  <li>{error}</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="govuk-button-group">
          {currentPassengerIndex < passengers.length - 1 ? (
            <button type="button" className="govuk-button" data-module="govuk-button" onClick={handleNextPassenger}>
              Save passenger and continue
            </button>
          ) : (
            <button type="button" className="govuk-button" data-module="govuk-button" disabled={busy || authz.loading} onClick={() => void handleSubmitAll()}>
              {busy ? 'Submitting…' : 'Submit request'}
            </button>
          )}

          {currentPassengerIndex > 0 && (
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              data-module="govuk-button"
              onClick={() => setCurrentPassengerIndex((i) => i - 1)}
            >
              Previous passenger
            </button>
          )}

          <button
            type="button"
            className="govuk-button govuk-button--secondary"
            data-module="govuk-button"
            onClick={() => setStep('flight-requirements')}
          >
            Back to flight requirements
          </button>
        </div>
      </div>
    </div>
  )
}
