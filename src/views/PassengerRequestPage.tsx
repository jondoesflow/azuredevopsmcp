import { useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { env } from '../config'
import { DataverseClient } from '../dataverse/dataverseClient'
import type { PassengerRequest } from '../dataverse/types'
import { AirportSelect } from '../ui/AirportSelect'
import { useAuthz } from '../authz/AuthzProvider'
import { canCreateRequest } from '../authz/authz'

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

export function PassengerRequestPage() {
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

  const [form, setForm] = useState<PassengerRequest>({
    surname: '',
    forenames: '',
    documentTypeLabel: 'Passport',
    documentNumber: '',
    departingOn: nowDateTimeLocal(),
    returningOn: nowDateTimeLocal(),
    departingFromIata: '',
    destinationIata: '',
  })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submittedReference, setSubmittedReference] = useState<string | null>(null)

  async function ensureLogin() {
    if (account) return
    const scope = `${env.dataverseUrl.replace(/\/$/, '')}/.default`
    await instance.loginRedirect({
      scopes: [scope],
      redirectStartPage: window.location.href,
    })
  }

  async function submit() {
    setError(null)
    setSubmittedReference(null)

    if (account && !canSubmit) {
      setError(
        'You do not have permission to create passenger requests in Dataverse. Ask for the Passenger, Booking Officer, HR personel or System Administrator role.',
      )
      return
    }

    if (!isAfter(form.returningOn, form.departingOn)) {
      setError('Returning on must be later than departing on')
      return
    }

    if (!form.departingFromIata || !form.destinationIata) {
      setError('Please select both departure and destination airports')
      return
    }

    try {
      setBusy(true)
      await ensureLogin()
      const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | null
      if (!acct) throw new Error('No signed-in account available')

      const res = await client.createPassengerRequest(acct, form)
      setSubmittedReference(res.referenceName ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-xl">Passenger request</h1>
        <p className="govuk-body">
          Enter passenger details and preferred travel dates.
        </p>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="surname">
            Surname
          </label>
          <input
            className="govuk-input"
            id="surname"
            type="text"
            value={form.surname}
            onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))}
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
            value={form.forenames}
            onChange={(e) => setForm((f) => ({ ...f, forenames: e.target.value }))}
          />
        </div>

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="document-type">
            Document type
          </label>
          <select
            className="govuk-select"
            id="document-type"
            value={form.documentTypeLabel}
            onChange={(e) =>
              setForm((f) => ({ ...f, documentTypeLabel: e.target.value }))
            }
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
            value={form.documentNumber}
            onChange={(e) =>
              setForm((f) => ({ ...f, documentNumber: e.target.value }))
            }
          />
        </div>

        <AirportSelect
          label="Departing from"
          valueIata={form.departingFromIata}
          onChange={(a) => setForm((f) => ({ ...f, departingFromIata: a.iata }))}
        />

        <AirportSelect
          label="Arriving at"
          valueIata={form.destinationIata}
          onChange={(a) => setForm((f) => ({ ...f, destinationIata: a.iata }))}
        />

        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="departing-on">
            Departing on
          </label>
          <input
            className="govuk-input"
            id="departing-on"
            type="datetime-local"
            value={form.departingOn}
            onChange={(e) => setForm((f) => ({ ...f, departingOn: e.target.value }))}
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
            value={form.returningOn}
            onChange={(e) => setForm((f) => ({ ...f, returningOn: e.target.value }))}
          />
        </div>

        {error ? (
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
        ) : null}

        {submittedReference ? (
          <>
            <div className="govuk-panel govuk-panel--confirmation">
              <h2 className="govuk-panel__title">Request submitted</h2>
              <div className="govuk-panel__body">
                Your reference:<br />
                <strong>{submittedReference}</strong>
              </div>
            </div>

            <div className="govuk-warning-text">
              <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
              <strong className="govuk-warning-text__text">
                <span className="govuk-visually-hidden">Warning</span>
                Please make a note of this reference for all future correspondence.
              </strong>
            </div>

            <p className="govuk-body">
              <a href="/" className="govuk-link">Return to home</a>
            </p>
          </>
        ) : null}

        {!submittedReference && (
          <div className="govuk-button-group">
            {account ? (
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || authz.loading}
                className="govuk-button"
                data-module="govuk-button"
              >
                {busy ? 'Submitting…' : 'Submit request'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void ensureLogin()}
                disabled={busy}
                className="govuk-button"
                data-module="govuk-button"
              >
                Sign in to submit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
