import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { DataverseClient } from '../dataverse/dataverseClient'
import { env } from '../config'
import type { PassengerRequestListItem } from '../dataverse/types'
import { acquireDataverseAccessToken } from '../auth/dataverseToken'
import { useAuthz } from '../authz/useAuthz'
import { getExternalSession, getRememberedExternalEmail } from '../auth/externalSession'

function formatDateTime(value: string | undefined): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

export function MyRequestsPage() {
  const { instance, accounts } = useMsal()
  const authz = useAuthz()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const accountHomeId = account?.homeAccountId

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => await acquireDataverseAccessToken(instance, acct),
    })
  }, [instance])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rows, setRows] = useState<PassengerRequestListItem[]>([])
  const externalApiBase = useMemo(() => env.externalOnboardingApiBaseUrl.replace(/\/$/, ''), [])

  const lastLoadedHomeIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    let cancelled = false

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

    async function load() {
      if (authz.isExternalUser) {
        const email = resolveExternalEmail()
        if (!email) {
          setError('Unable to resolve external email. Please sign in again to view your requests.')
          return
        }

        setBusy(true)
        setError(null)
        try {
          const response = await fetch(`${externalApiBase}/api/external-onboarding/my-requests?email=${encodeURIComponent(email)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          })

          if (!response.ok) {
            const text = await response.text().catch(() => '')
            throw new Error(text || `Failed to load external requests (${response.status})`)
          }

          const payload = (await response.json().catch(() => ({}))) as {
            value?: PassengerRequestListItem[]
          }

          if (cancelled) return
          setRows(Array.isArray(payload.value) ? payload.value : [])
        } catch (e) {
          if (cancelled) return
          setError(e instanceof Error ? e.message : 'Failed to load requests')
        } finally {
          if (!cancelled) setBusy(false)
        }
        return
      }

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
  }, [accountHomeId, authz.isExternalUser, client, instance, accounts, account, externalApiBase])

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
