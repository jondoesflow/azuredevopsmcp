import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { DataverseClient } from '../../dataverse/dataverseClient'
import { env } from '../../config'
import type { PassengerRequestListItem } from '../../dataverse/types'
import { AirportSelect } from '../../ui/AirportSelect'

function formatDateTime(value: string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function toDateTimeLocalValue(value: string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

export function AdminQueuePage() {
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const accountHomeId = account?.homeAccountId

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

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [rows, setRows] = useState<PassengerRequestListItem[]>([])
  const lastLoadedHomeIdRef = useRef<string | undefined>(undefined)

  const [selected, setSelected] = useState<PassengerRequestListItem | null>(null)
  const [edit, setEdit] = useState({
    surname: '',
    forenames: '',
    departingFromIata: '',
    destinationIata: '',
    departingOn: '',
    returningOn: '',
  })

  async function updateStatus(newStatus: string) {
    setError(null)
    setSuccess(null)

    const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
    if (!acct) {
      setError('No signed-in account available')
      return
    }
    if (!selected) return

    try {
      setBusy(true)
      await client.updatePassengerRequest(acct, selected, {
        transportRequestStatusLabel: newStatus,
      })

      setSelected((s) => (s ? { ...s, transportRequestStatusLabel: newStatus } : s))
      setRows((rs) =>
        rs.map((r) =>
          selected.odataId && r.odataId === selected.odataId
            ? { ...r, transportRequestStatusLabel: newStatus }
            : r,
        ),
      )

      const res = await client.listAllPassengerRequests(acct)
      setRows(res)
      const refreshed = res.find((x) => x.odataId && x.odataId === selected.odataId) ?? null
      if (refreshed) setSelected(refreshed)

      setSuccess(`Status updated to ${newStatus}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!accountHomeId) {
        setError('Please sign in to view requests')
        return
      }

      if (lastLoadedHomeIdRef.current === accountHomeId) return

      const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
      if (!acct) {
        setError('No signed-in account available')
        return
      }

      setBusy(true)
      setError(null)
      setSuccess(null)
      try {
        const res = await client.listAllPassengerRequests(acct)
        if (cancelled) return
        lastLoadedHomeIdRef.current = accountHomeId
        setRows(res)
      } catch (e) {
        if (cancelled) return
        lastLoadedHomeIdRef.current = undefined
        setError(e instanceof Error ? e.message : 'Failed to load requests')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accountHomeId, client, instance, accounts])

  return (
    <div>
      <h1 className="govuk-heading-l">Admin queue</h1>

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
        <div
          className="govuk-notification-banner"
          role="region"
          aria-labelledby="govuk-notification-banner-title"
          data-module="govuk-notification-banner"
        >
          <div className="govuk-notification-banner__header">
            <h2 className="govuk-notification-banner__title" id="govuk-notification-banner-title">
              Success
            </h2>
          </div>
          <div className="govuk-notification-banner__content">
            <p className="govuk-notification-banner__heading">{success}</p>
          </div>
        </div>
      ) : null}

      {busy ? <p className="govuk-body">Loading…</p> : null}

      {!busy && !error && rows.length === 0 ? (
        <p className="govuk-body">No requests found.</p>
      ) : null}

      {!busy && !error && rows.length > 0 ? (
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header">Surname</th>
              <th scope="col" className="govuk-table__header">Forenames</th>
              <th scope="col" className="govuk-table__header">From</th>
              <th scope="col" className="govuk-table__header">To</th>
              <th scope="col" className="govuk-table__header">Status</th>
              <th scope="col" className="govuk-table__header">Departing</th>
              <th scope="col" className="govuk-table__header">Returning</th>
              <th scope="col" className="govuk-table__header">Created</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {rows.map((r, idx) => (
              <tr
                className="govuk-table__row"
                key={r.id ?? String(idx)}
                onClick={() => {
                  setSelected(r)
                  setEdit({
                    surname: r.surname ?? '',
                    forenames: r.forenames ?? '',
                    departingFromIata: r.departingFromIata ?? '',
                    destinationIata: r.destinationIata ?? '',
                    departingOn: toDateTimeLocalValue(r.departingOn),
                    returningOn: toDateTimeLocalValue(r.returningOn),
                  })
                }}
                style={{ cursor: 'pointer' }}
              >
                <td className="govuk-table__cell">{r.surname ?? ''}</td>
                <td className="govuk-table__cell">{r.forenames ?? ''}</td>
                <td className="govuk-table__cell">{r.departingFromIata ?? ''}</td>
                <td className="govuk-table__cell">{r.destinationIata ?? ''}</td>
                <td className="govuk-table__cell">{r.transportRequestStatusLabel ?? ''}</td>
                <td className="govuk-table__cell">{formatDateTime(r.departingOn)}</td>
                <td className="govuk-table__cell">{formatDateTime(r.returningOn)}</td>
                <td className="govuk-table__cell">{formatDateTime(r.createdOn)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {selected ? (
        <div className="govuk-!-margin-top-6">
          <h2 className="govuk-heading-m">Edit request</h2>

          <p className="govuk-body">
            <strong>Status:</strong> {selected.transportRequestStatusLabel ?? ''}
          </p>

          <div className="govuk-form-group">
            <label className="govuk-label">Surname</label>
            <input
              className="govuk-input"
              value={edit.surname}
              onChange={(e) => setEdit((s) => ({ ...s, surname: e.target.value }))}
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label">Forenames</label>
            <input
              className="govuk-input"
              value={edit.forenames}
              onChange={(e) => setEdit((s) => ({ ...s, forenames: e.target.value }))}
            />
          </div>

          <AirportSelect
            label="Departing from"
            valueIata={edit.departingFromIata}
            onChange={(a) => setEdit((s) => ({ ...s, departingFromIata: a.iata }))}
          />

          <AirportSelect
            label="Destination"
            valueIata={edit.destinationIata}
            onChange={(a) => setEdit((s) => ({ ...s, destinationIata: a.iata }))}
          />

          <div className="govuk-form-group">
            <label className="govuk-label">Departing on</label>
            <input
              type="datetime-local"
              className="govuk-input"
              value={edit.departingOn}
              onChange={(e) => setEdit((s) => ({ ...s, departingOn: e.target.value }))}
            />
          </div>

          <div className="govuk-form-group">
            <label className="govuk-label">Returning on</label>
            <input
              type="datetime-local"
              className="govuk-input"
              value={edit.returningOn}
              onChange={(e) => setEdit((s) => ({ ...s, returningOn: e.target.value }))}
            />
          </div>

          <div className="govuk-button-group">
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              disabled={busy}
              onClick={() => {
                void updateStatus('In Progress')
              }}
            >
              Pick up (In Progress)
            </button>

            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              disabled={busy}
              onClick={() => {
                void updateStatus('Approved')
              }}
            >
              Approve
            </button>

            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              disabled={busy}
              onClick={() => {
                void updateStatus('Rejected')
              }}
            >
              Reject
            </button>

            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              disabled={busy}
              onClick={() => {
                void updateStatus('Cancelled')
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              className="govuk-button"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setError(null)
                  setSuccess(null)

                  const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
                  if (!acct) {
                    setError('No signed-in account available')
                    return
                  }

                  try {
                    setBusy(true)
                    await client.updatePassengerRequest(acct, selected, {
                      surname: edit.surname,
                      forenames: edit.forenames,
                      departingFromIata: edit.departingFromIata,
                      destinationIata: edit.destinationIata,
                      departingOn: edit.departingOn,
                      returningOn: edit.returningOn,
                    })

                    const res = await client.listAllPassengerRequests(acct)
                    setRows(res)
                    setSuccess('Request updated')
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Update failed')
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              Save changes
            </button>
            <button
              type="button"
              className="govuk-button govuk-button--secondary"
              onClick={() => {
                setSelected(null)
                setError(null)
                setSuccess(null)
              }}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
