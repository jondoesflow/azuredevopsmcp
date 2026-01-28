import { useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { env } from '../../config'
import { DataverseClient } from '../../dataverse/dataverseClient'
import type { PassengerRequest } from '../../dataverse/types'
import { AirportSelect } from '../../ui/AirportSelect'
import { useAuthz } from '../../authz/AuthzProvider'
import { canCreateRequest } from '../../authz/authz'

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

type PassengerFormData = PassengerRequest & { isLeadPassenger: boolean }

function createEmptyPassenger(isLead: boolean): PassengerFormData {
  return {
    surname: '',
    forenames: '',
    documentTypeLabel: 'Passport',
    documentNumber: '',
    departingOn: nowDateTimeLocal(),
    returningOn: nowDateTimeLocal(),
    departingFromIata: '',
    destinationIata: '',
    isLeadPassenger: isLead,
  }
}

type Step = 'choose-count' | 'fill-passengers' | 'review' | 'success'

type EditingField = 
  | { type: 'travel' }
  | { type: 'passenger'; index: number }
  | null

type SubmissionResult = {
  passengerReferences: string[]
  groupName?: string
}

export function HrRequestPage() {
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const authz = useAuthz()
  const canSubmit = account ? canCreateRequest(authz.roles) : false

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => {
        const scope = `${env.dataverseUrl.replace(/\/$/, '')}/.default`
        const result = await instance.acquireTokenSilent({
          account: acct,
          scopes: [scope],
        })
        return result.accessToken
      },
    })
  }, [instance])

  const [step, setStep] = useState<Step>('choose-count')
  const [passengerCountChoice, setPassengerCountChoice] = useState<'one' | 'multiple' | null>(null)
  const [passengerCount, setPassengerCount] = useState(2)
  const [passengers, setPassengers] = useState<PassengerFormData[]>([createEmptyPassenger(true)])
  const [currentPassengerIndex, setCurrentPassengerIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null)
  const [editingField, setEditingField] = useState<EditingField>(null)

  // Shared travel details for multi-passenger bookings
  const [sharedDepartingFromIata, setSharedDepartingFromIata] = useState('')
  const [sharedDestinationIata, setSharedDestinationIata] = useState('')
  const [sharedDepartingOn, setSharedDepartingOn] = useState(nowDateTimeLocal())
  const [sharedReturningOn, setSharedReturningOn] = useState(nowDateTimeLocal())

  const isMultiPassenger = passengerCountChoice === 'multiple'

  function handleCountChoiceContinue() {
    setError(null)
    
    // Validate shared travel dates for multi-passenger
    if (passengerCountChoice === 'multiple') {
      if (!sharedDepartingFromIata || !sharedDestinationIata) {
        setError('Please select both departure and destination airports.')
        return
      }
      if (!isAfter(sharedReturningOn, sharedDepartingOn)) {
        setError('Returning on date must be after departing on date.')
        return
      }
    }
    
    if (passengerCountChoice === 'one') {
      setPassengers([createEmptyPassenger(true)])
      setCurrentPassengerIndex(0)
      setStep('fill-passengers')
    } else if (passengerCountChoice === 'multiple') {
      const newPassengers: PassengerFormData[] = []
      for (let i = 0; i < passengerCount; i++) {
        newPassengers.push(createEmptyPassenger(i === 0))
      }
      setPassengers(newPassengers)
      setCurrentPassengerIndex(0)
      setStep('fill-passengers')
    }
  }

  function handleProceedToReview() {
    setError(null)
    
    // Validate all passengers
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i]
      if (!p.surname.trim() || !p.forenames.trim()) {
        setError(`Passenger ${i + 1}: Please enter surname and forenames.`)
        setCurrentPassengerIndex(i)
        return
      }
      // For single passenger, validate individual travel fields
      if (!isMultiPassenger) {
        if (!p.departingFromIata || !p.destinationIata) {
          setError(`Passenger ${i + 1}: Please select both departure and destination airports.`)
          setCurrentPassengerIndex(i)
          return
        }
        if (!isAfter(p.returningOn, p.departingOn)) {
          setError(`Passenger ${i + 1}: Returning on date must be after departing on date.`)
          setCurrentPassengerIndex(i)
          return
        }
      }
    }
    
    setStep('review')
  }

  function updatePassengerAtIndex(index: number, updates: Partial<PassengerFormData>) {
    setPassengers((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], ...updates }
      return updated
    })
  }

  function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function updateCurrentPassenger(updates: Partial<PassengerFormData>) {
    setPassengers((prev) => {
      const updated = [...prev]
      updated[currentPassengerIndex] = { ...updated[currentPassengerIndex], ...updates }
      return updated
    })
  }

  function handleNext() {
    if (currentPassengerIndex < passengers.length - 1) {
      setCurrentPassengerIndex((i) => i + 1)
    }
  }

  function handlePrevious() {
    if (currentPassengerIndex > 0) {
      setCurrentPassengerIndex((i) => i - 1)
    }
  }

  async function handleConfirmSubmit() {
    setError(null)

    if (!account) {
      setError('You must be signed in to submit requests.')
      return
    }

    if (!canSubmit) {
      setError('You do not have permission to create passenger requests.')
      return
    }

    try {
      setBusy(true)

      const leadPassenger = passengers.find((p) => p.isLeadPassenger) ?? passengers[0]
      const leadName = `${leadPassenger.forenames} ${leadPassenger.surname}`.trim()

      let groupId: string | undefined
      let groupName: string | undefined

      if (passengers.length > 1) {
        const groupResult = await client.createPaxGroup(account, leadName, passengers.length)
        groupId = groupResult.id
        groupName = groupResult.groupName
      }

      const passengerReferences: string[] = []
      for (const passenger of passengers) {
        // For multi-passenger, use shared travel details
        const requestData = isMultiPassenger
          ? {
              ...passenger,
              departingFromIata: sharedDepartingFromIata,
              destinationIata: sharedDestinationIata,
              departingOn: sharedDepartingOn,
              returningOn: sharedReturningOn,
              transportRequestStatusLabel: 'Submitted',
              groupId,
            }
          : {
              ...passenger,
              transportRequestStatusLabel: 'Submitted',
              groupId,
            }
        const result = await client.createPassengerRequest(account, requestData)
        if (result.referenceName) {
          passengerReferences.push(result.referenceName)
        }
      }

      setSubmissionResult({ passengerReferences, groupName })
      setStep('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  const currentPassenger = passengers[currentPassengerIndex]

  if (step === 'success' && submissionResult) {
    const { passengerReferences, groupName } = submissionResult
    const isGroup = passengerReferences.length > 1 && groupName

    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <div className="govuk-panel govuk-panel--confirmation">
            <h1 className="govuk-panel__title">
              {isGroup ? 'Group booking submitted' : 'Request submitted'}
            </h1>
            {isGroup && groupName && (
              <div className="govuk-panel__body">
                Group reference: <strong>{groupName}</strong>
              </div>
            )}
          </div>

          <h2 className="govuk-heading-m">Your reference{passengerReferences.length > 1 ? 's' : ''}</h2>
          
          {passengerReferences.length > 0 ? (
            <ul className="govuk-list govuk-list--bullet">
              {passengerReferences.map((ref, idx) => (
                <li key={idx}>
                  <strong>{ref}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="govuk-body">References are being generated.</p>
          )}

          <div className="govuk-warning-text">
            <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
            <strong className="govuk-warning-text__text">
              <span className="govuk-visually-hidden">Warning</span>
              Please make a note of these references for all future correspondence.
            </strong>
          </div>

          <p className="govuk-body">
            <a href="/" className="govuk-link">
              Return to home
            </a>
          </p>
        </div>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Check your answers</h1>
          <p className="govuk-body">
            Please review the details below before confirming your request{passengers.length > 1 ? 's' : ''}.
          </p>

          {/* Travel Details Section */}
          <h2 className="govuk-heading-m">Travel details</h2>
          {editingField?.type === 'travel' ? (
            <div className="govuk-inset-text">
              <AirportSelect
                label="Departing from"
                valueIata={isMultiPassenger ? sharedDepartingFromIata : passengers[0].departingFromIata}
                onChange={(a) => {
                  if (isMultiPassenger) {
                    setSharedDepartingFromIata(a.iata)
                  } else {
                    updatePassengerAtIndex(0, { departingFromIata: a.iata })
                  }
                }}
              />
              <AirportSelect
                label="Arriving at"
                valueIata={isMultiPassenger ? sharedDestinationIata : passengers[0].destinationIata}
                onChange={(a) => {
                  if (isMultiPassenger) {
                    setSharedDestinationIata(a.iata)
                  } else {
                    updatePassengerAtIndex(0, { destinationIata: a.iata })
                  }
                }}
              />
              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="edit-departing-on">Departing on</label>
                <input
                  className="govuk-input"
                  id="edit-departing-on"
                  type="datetime-local"
                  value={isMultiPassenger ? sharedDepartingOn : passengers[0].departingOn}
                  onChange={(e) => {
                    if (isMultiPassenger) {
                      setSharedDepartingOn(e.target.value)
                    } else {
                      updatePassengerAtIndex(0, { departingOn: e.target.value })
                    }
                  }}
                />
              </div>
              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="edit-returning-on">Returning on</label>
                <input
                  className="govuk-input"
                  id="edit-returning-on"
                  type="datetime-local"
                  value={isMultiPassenger ? sharedReturningOn : passengers[0].returningOn}
                  onChange={(e) => {
                    if (isMultiPassenger) {
                      setSharedReturningOn(e.target.value)
                    } else {
                      updatePassengerAtIndex(0, { returningOn: e.target.value })
                    }
                  }}
                />
              </div>
              <button
                type="button"
                className="govuk-button govuk-button--secondary"
                onClick={() => setEditingField(null)}
              >
                Save
              </button>
            </div>
          ) : (
            <dl className="govuk-summary-list">
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Departing from</dt>
                <dd className="govuk-summary-list__value">
                  {isMultiPassenger ? sharedDepartingFromIata : passengers[0].departingFromIata}
                </dd>
                <dd className="govuk-summary-list__actions">
                  <button type="button" className="govuk-link" onClick={() => setEditingField({ type: 'travel' })}>
                    Change<span className="govuk-visually-hidden"> departing from</span>
                  </button>
                </dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Arriving at</dt>
                <dd className="govuk-summary-list__value">
                  {isMultiPassenger ? sharedDestinationIata : passengers[0].destinationIata}
                </dd>
                <dd className="govuk-summary-list__actions">
                  <button type="button" className="govuk-link" onClick={() => setEditingField({ type: 'travel' })}>
                    Change<span className="govuk-visually-hidden"> arriving at</span>
                  </button>
                </dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Departing on</dt>
                <dd className="govuk-summary-list__value">
                  {formatDateTime(isMultiPassenger ? sharedDepartingOn : passengers[0].departingOn)}
                </dd>
                <dd className="govuk-summary-list__actions">
                  <button type="button" className="govuk-link" onClick={() => setEditingField({ type: 'travel' })}>
                    Change<span className="govuk-visually-hidden"> departing on</span>
                  </button>
                </dd>
              </div>
              <div className="govuk-summary-list__row">
                <dt className="govuk-summary-list__key">Returning on</dt>
                <dd className="govuk-summary-list__value">
                  {formatDateTime(isMultiPassenger ? sharedReturningOn : passengers[0].returningOn)}
                </dd>
                <dd className="govuk-summary-list__actions">
                  <button type="button" className="govuk-link" onClick={() => setEditingField({ type: 'travel' })}>
                    Change<span className="govuk-visually-hidden"> returning on</span>
                  </button>
                </dd>
              </div>
            </dl>
          )}

          {/* Passenger Details Section */}
          {passengers.map((passenger, idx) => (
            <div key={idx}>
              <h2 className="govuk-heading-m">
                Passenger {idx + 1}{passenger.isLeadPassenger ? ' (Lead)' : ''}
              </h2>
              {editingField?.type === 'passenger' && editingField.index === idx ? (
                <div className="govuk-inset-text">
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor={`edit-surname-${idx}`}>Surname</label>
                    <input
                      className="govuk-input"
                      id={`edit-surname-${idx}`}
                      type="text"
                      value={passenger.surname}
                      onChange={(e) => updatePassengerAtIndex(idx, { surname: e.target.value })}
                    />
                  </div>
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor={`edit-forenames-${idx}`}>Forenames</label>
                    <input
                      className="govuk-input"
                      id={`edit-forenames-${idx}`}
                      type="text"
                      value={passenger.forenames}
                      onChange={(e) => updatePassengerAtIndex(idx, { forenames: e.target.value })}
                    />
                  </div>
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor={`edit-doctype-${idx}`}>Document type</label>
                    <select
                      className="govuk-select"
                      id={`edit-doctype-${idx}`}
                      value={passenger.documentTypeLabel}
                      onChange={(e) => updatePassengerAtIndex(idx, { documentTypeLabel: e.target.value })}
                    >
                      <option value="Passport">Passport</option>
                      <option value="Warrant Card">Warrant Card</option>
                      <option value="ID Card">ID Card</option>
                    </select>
                  </div>
                  <div className="govuk-form-group">
                    <label className="govuk-label" htmlFor={`edit-docnum-${idx}`}>Document number</label>
                    <input
                      className="govuk-input"
                      id={`edit-docnum-${idx}`}
                      type="text"
                      value={passenger.documentNumber}
                      onChange={(e) => updatePassengerAtIndex(idx, { documentNumber: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="govuk-button govuk-button--secondary"
                    onClick={() => setEditingField(null)}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <dl className="govuk-summary-list">
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Name</dt>
                    <dd className="govuk-summary-list__value">{passenger.forenames} {passenger.surname}</dd>
                    <dd className="govuk-summary-list__actions">
                      <button type="button" className="govuk-link" onClick={() => setEditingField({ type: 'passenger', index: idx })}>
                        Change<span className="govuk-visually-hidden"> name</span>
                      </button>
                    </dd>
                  </div>
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Document type</dt>
                    <dd className="govuk-summary-list__value">{passenger.documentTypeLabel}</dd>
                    <dd className="govuk-summary-list__actions">
                      <button type="button" className="govuk-link" onClick={() => setEditingField({ type: 'passenger', index: idx })}>
                        Change<span className="govuk-visually-hidden"> document type</span>
                      </button>
                    </dd>
                  </div>
                  <div className="govuk-summary-list__row">
                    <dt className="govuk-summary-list__key">Document number</dt>
                    <dd className="govuk-summary-list__value">{passenger.documentNumber || '—'}</dd>
                    <dd className="govuk-summary-list__actions">
                      <button type="button" className="govuk-link" onClick={() => setEditingField({ type: 'passenger', index: idx })}>
                        Change<span className="govuk-visually-hidden"> document number</span>
                      </button>
                    </dd>
                  </div>
                </dl>
              )}
            </div>
          ))}

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
            <button
              type="button"
              className="govuk-button"
              data-module="govuk-button"
              disabled={busy || authz.loading}
              onClick={() => void handleConfirmSubmit()}
            >
              {busy ? 'Submitting…' : 'Confirm and submit'}
            </button>
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              data-module="govuk-button"
              onClick={() => setStep('fill-passengers')}
            >
              Back
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'choose-count') {
    return (
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Create passenger request</h1>
          <p className="govuk-body">
            As HR Personnel, you can create passenger requests on behalf of others.
          </p>

          <div className="govuk-form-group">
            <fieldset className="govuk-fieldset">
              <legend className="govuk-fieldset__legend govuk-fieldset__legend--m">
                <h2 className="govuk-fieldset__heading">
                  How many passengers do you need to add?
                </h2>
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
                  <label className="govuk-label govuk-radios__label" htmlFor="count-one">
                    1 passenger
                  </label>
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
                  <label className="govuk-label govuk-radios__label" htmlFor="count-multiple">
                    More than 1 passenger
                  </label>
                </div>
              </div>
            </fieldset>
          </div>

          {passengerCountChoice === 'multiple' && (
            <>
              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="passenger-count-select">
                  How many passengers? (2-10)
                </label>
                <select
                  className="govuk-select"
                  id="passenger-count-select"
                  value={passengerCount}
                  onChange={(e) => setPassengerCount(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                    <option key={n} value={n}>
                      {n} passengers
                    </option>
                  ))}
                </select>
              </div>

              <h2 className="govuk-heading-m">Shared travel details</h2>
              <p className="govuk-body">All passengers will travel together.</p>

              <AirportSelect
                label="Departing from"
                valueIata={sharedDepartingFromIata}
                onChange={(a) => setSharedDepartingFromIata(a.iata)}
              />

              <AirportSelect
                label="Arriving at"
                valueIata={sharedDestinationIata}
                onChange={(a) => setSharedDestinationIata(a.iata)}
              />

              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="shared-departing-on">
                  Departing on
                </label>
                <input
                  className="govuk-input"
                  id="shared-departing-on"
                  type="datetime-local"
                  value={sharedDepartingOn}
                  onChange={(e) => setSharedDepartingOn(e.target.value)}
                />
              </div>

              <div className="govuk-form-group">
                <label className="govuk-label" htmlFor="shared-returning-on">
                  Returning on
                </label>
                <input
                  className="govuk-input"
                  id="shared-returning-on"
                  type="datetime-local"
                  value={sharedReturningOn}
                  onChange={(e) => setSharedReturningOn(e.target.value)}
                />
              </div>
            </>
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

          <button
            type="button"
            className="govuk-button"
            data-module="govuk-button"
            disabled={!passengerCountChoice}
            onClick={handleCountChoiceContinue}
          >
            Continue
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">
          Passenger {currentPassengerIndex + 1} of {passengers.length}
          {currentPassenger.isLeadPassenger && (
            <span className="govuk-tag govuk-tag--blue" style={{ marginLeft: '1rem', verticalAlign: 'middle' }}>
              Lead passenger
            </span>
          )}
        </h1>

        {passengers.length > 1 && (
          <p className="govuk-body">
            The lead passenger's name will be used as the group name.
          </p>
        )}

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="surname">
            Surname
          </label>
          <input
            className="govuk-input"
            id="surname"
            type="text"
            value={currentPassenger.surname}
            onChange={(e) => updateCurrentPassenger({ surname: e.target.value })}
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="forenames">
            Forenames
          </label>
          <input
            className="govuk-input"
            id="forenames"
            type="text"
            value={currentPassenger.forenames}
            onChange={(e) => updateCurrentPassenger({ forenames: e.target.value })}
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="document-type">
            Document type
          </label>
          <select
            className="govuk-select"
            id="document-type"
            value={currentPassenger.documentTypeLabel}
            onChange={(e) => updateCurrentPassenger({ documentTypeLabel: e.target.value })}
          >
            <option value="Passport">Passport</option>
            <option value="Warrant Card">Warrant Card</option>
            <option value="ID Card">ID Card</option>
          </select>
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="document-number">
            Document number
          </label>
          <input
            className="govuk-input"
            id="document-number"
            type="text"
            value={currentPassenger.documentNumber}
            onChange={(e) => updateCurrentPassenger({ documentNumber: e.target.value })}
          />
        </div>

        {/* Travel fields only shown for single passenger */}
        {!isMultiPassenger && (
          <>
            <AirportSelect
              label="Departing from"
              valueIata={currentPassenger.departingFromIata}
              onChange={(a) => updateCurrentPassenger({ departingFromIata: a.iata })}
            />

            <AirportSelect
              label="Arriving at"
              valueIata={currentPassenger.destinationIata}
              onChange={(a) => updateCurrentPassenger({ destinationIata: a.iata })}
            />

            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="departing-on">
                Departing on
              </label>
              <input
                className="govuk-input"
                id="departing-on"
                type="datetime-local"
                value={currentPassenger.departingOn}
                onChange={(e) => updateCurrentPassenger({ departingOn: e.target.value })}
              />
            </div>

            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="returning-on">
                Returning on
              </label>
              <input
                className="govuk-input"
                id="returning-on"
                type="datetime-local"
                value={currentPassenger.returningOn}
                onChange={(e) => updateCurrentPassenger({ returningOn: e.target.value })}
              />
            </div>
          </>
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
          {currentPassengerIndex > 0 && (
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              data-module="govuk-button"
              onClick={handlePrevious}
            >
              Previous passenger
            </button>
          )}

          {currentPassengerIndex < passengers.length - 1 ? (
            <button
              type="button"
              className="govuk-button"
              data-module="govuk-button"
              onClick={handleNext}
            >
              Next passenger
            </button>
          ) : (
            <button
              type="button"
              className="govuk-button"
              data-module="govuk-button"
              onClick={handleProceedToReview}
            >
              Review and confirm
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
