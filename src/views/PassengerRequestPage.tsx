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
  const [success, setSuccess] = useState<string | null>(null)

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
    setSuccess(null)

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
      setSuccess(res.id ? `Submitted (${res.id})` : 'Submitted')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl justify-center">
      <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Passenger request</h2>
        <p className="mt-1 text-sm text-slate-600">
          Enter passenger details and preferred travel.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Surname</label>
            <input
              value={form.surname}
              onChange={(e) => setForm((f) => ({ ...f, surname: e.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-200 focus:ring-4"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Forenames</label>
            <input
              value={form.forenames}
              onChange={(e) => setForm((f) => ({ ...f, forenames: e.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-200 focus:ring-4"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Document type</label>
            <select
              value={form.documentTypeLabel}
              onChange={(e) =>
                setForm((f) => ({ ...f, documentTypeLabel: e.target.value }))
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-200 focus:ring-4"
            >
              <option>Passport</option>
              <option>National ID</option>
              <option>Other</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Document number</label>
            <input
              value={form.documentNumber}
              onChange={(e) =>
                setForm((f) => ({ ...f, documentNumber: e.target.value }))
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-200 focus:ring-4"
            />
          </div>

          <AirportSelect
            label="Departing From"
            valueIata={form.departingFromIata}
            onChange={(a) => setForm((f) => ({ ...f, departingFromIata: a.iata }))}
          />

          <AirportSelect
            label="Arriving at"
            valueIata={form.destinationIata}
            onChange={(a) => setForm((f) => ({ ...f, destinationIata: a.iata }))}
          />

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Departing on</label>
            <input
              type="datetime-local"
              value={form.departingOn}
              onChange={(e) => setForm((f) => ({ ...f, departingOn: e.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-200 focus:ring-4"
            />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Returning on</label>
            <input
              type="datetime-local"
              value={form.returningOn}
              onChange={(e) => setForm((f) => ({ ...f, returningOn: e.target.value }))}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-200 focus:ring-4"
            />
          </div>
        </div>

        {error ? (
          <div className="govuk-error-summary" data-module="govuk-error-summary">
            <div role="alert">
              <h2 className="govuk-error-summary__title">There is a problem</h2>
              <div className="govuk-error-summary__body">
                <ul className="govuk-list govuk-error-summary__list">
                  <li>
                    <a href="#">{error}</a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        ) : null}
        {success ? (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {success}
          </div>
        ) : null}

        <div className="mt-6 govuk-button-group">
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
      </div>
    </div>
  )
}
