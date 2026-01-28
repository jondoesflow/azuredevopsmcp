import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { DataverseClient } from '../dataverse/dataverseClient'
import { env } from '../config'
import type { PassengerRequestListItem } from '../dataverse/types'

function formatDateTime(value: string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function MyRequestsPage() {
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
  const [rows, setRows] = useState<PassengerRequestListItem[]>([])

  const lastLoadedHomeIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!accountHomeId) {
        setError('Please sign in to view your requests')
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
      try {
        // Use saved view if configured, otherwise fall back to listMyPassengerRequests
        const viewGuid = env.viewGuidMyPassengerBookings
        const res = viewGuid
          ? await client.listPassengerRequestsByView(acct, viewGuid)
          : await client.listMyPassengerRequests(acct)
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
      <h1 className="govuk-heading-l">Your requests</h1>

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
              <tr className="govuk-table__row" key={r.id ?? String(idx)}>
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
    </div>
  )
}
