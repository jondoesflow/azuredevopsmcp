import { useEffect, useMemo, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { DataverseClient } from '../../dataverse/dataverseClient'
import { env } from '../../config'
import type { AuthoriserListItem, LookupOption } from '../../dataverse/types'
import { acquireDataverseAccessToken } from '../../auth/dataverseToken'

type EditableAuthoriser = AuthoriserListItem & {
  draftName: string
  draftEmail: string
  draftBookingOfficeId: string
}

type CreateAuthoriserForm = {
  name: string
  email: string
  bookingOfficeId: string
}

const ALLOWED_BOOKING_OFFICES = new Set(['booking office a', 'booking office b', 'booking office c'])

export function AuthorisedApproversPage() {
  const { instance, accounts } = useMsal()
  const account = useMemo(() => (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined, [instance, accounts])

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => await acquireDataverseAccessToken(instance, acct),
    })
  }, [instance])

  const [rows, setRows] = useState<EditableAuthoriser[]>([])
  const [teamOptions, setTeamOptions] = useState<LookupOption[]>([])
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState<CreateAuthoriserForm>({
    name: '',
    email: '',
    bookingOfficeId: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const bookingOfficeOptions = useMemo(
    () => teamOptions.filter((team) => ALLOWED_BOOKING_OFFICES.has((team.name ?? '').trim().toLowerCase())),
    [teamOptions],
  )

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!account) return
      if (!env.viewActiveAuthorisers) {
        setError('Missing VITE_DATAVERSE_VIEW_ACTIVE_AUTHORISERS in environment configuration.')
        return
      }

      setLoading(true)
      setError(null)
      setSuccess(null)
      try {
        const [authorisers, teams] = await Promise.all([
          client.listAuthorisersByView(account, env.viewActiveAuthorisers),
          client.listTeamOptions(account),
        ])

        const allowedTeams = teams.filter((team) => ALLOWED_BOOKING_OFFICES.has((team.name ?? '').trim().toLowerCase()))
        const allowedTeamIds = new Set(allowedTeams.map((team) => team.id.toLowerCase()))

        if (cancelled) return
        setTeamOptions(allowedTeams)
        setRows(
          authorisers
            .filter((item) => {
              const bookingOfficeId = (item.bookingOfficeId ?? '').trim().toLowerCase()
              return bookingOfficeId ? allowedTeamIds.has(bookingOfficeId) : true
            })
            .map((item) => ({
              ...item,
              draftName: item.authoriserName ?? '',
              draftEmail: item.email ?? '',
              draftBookingOfficeId: item.bookingOfficeId ?? '',
            })),
        )
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load authorised approvers')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [account, client])

  async function saveRow(item: EditableAuthoriser) {
    if (!account || !item.odataId) return

    const name = item.draftName.trim()
    const email = item.draftEmail.trim()

    if (!name) {
      setError('Authoriser name is required.')
      return
    }
    if (!email) {
      setError('Email address is required.')
      return
    }
    if (!item.draftBookingOfficeId.trim()) {
      setError('Booking Office is required.')
      return
    }

    setSavingId(item.odataId)
    setError(null)
    setSuccess(null)
    try {
      await client.updateAuthoriser(
        account,
        { odataId: item.odataId, etag: item.etag },
        {
          authoriserName: name,
          email,
          bookingOfficeId: item.draftBookingOfficeId || undefined,
        },
      )
      setRows((prev) =>
        prev.map((row) =>
          row.odataId === item.odataId
            ? {
                ...row,
                authoriserName: name,
                email,
                bookingOfficeId: item.draftBookingOfficeId || undefined,
                bookingOfficeName:
                  bookingOfficeOptions.find((t) => t.id.toLowerCase() === item.draftBookingOfficeId.toLowerCase())?.name ?? row.bookingOfficeName,
              }
            : row,
        ),
      )
      setSuccess('Authoriser updated successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update authoriser')
    } finally {
      setSavingId(null)
    }
  }

  async function createAuthoriser() {
    if (!account) return

    const name = createForm.name.trim()
    const email = createForm.email.trim()
    const bookingOfficeId = createForm.bookingOfficeId.trim()

    if (!name) {
      setError('Authoriser name is required.')
      return
    }
    if (!email) {
      setError('Email address is required.')
      return
    }
    if (!bookingOfficeId) {
      setError('Booking Office is required.')
      return
    }

    setCreating(true)
    setError(null)
    setSuccess(null)
    try {
      await client.createAuthoriser(account, {
        authoriserName: name,
        email,
        bookingOfficeId,
      })

      if (env.viewActiveAuthorisers) {
        const refreshed = await client.listAuthorisersByView(account, env.viewActiveAuthorisers)
        const allowedTeamIds = new Set(bookingOfficeOptions.map((team) => team.id.toLowerCase()))
        setRows(
          refreshed
            .filter((item) => {
              const selectedId = (item.bookingOfficeId ?? '').trim().toLowerCase()
              return selectedId ? allowedTeamIds.has(selectedId) : true
            })
            .map((item) => ({
              ...item,
              draftName: item.authoriserName ?? '',
              draftEmail: item.email ?? '',
              draftBookingOfficeId: item.bookingOfficeId ?? '',
            })),
        )
      }

      setCreateForm({ name: '', email: '', bookingOfficeId: '' })
      setSuccess('Authoriser added successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add authoriser')
    } finally {
      setCreating(false)
    }
  }

  async function deleteRow(item: EditableAuthoriser) {
    if (!account || !item.odataId) return

    const label = item.authoriserName?.trim() || item.email?.trim() || 'this authoriser'
    const confirmed = window.confirm(`Delete ${label}? This will also remove them from their Booking Office team.`)
    if (!confirmed) return

    setDeletingId(item.odataId)
    setError(null)
    setSuccess(null)
    try {
      await client.deleteAuthoriser(account, {
        odataId: item.odataId,
        etag: item.etag,
        email: item.email,
        bookingOfficeId: item.bookingOfficeId,
      })
      setRows((prev) => prev.filter((row) => row.odataId !== item.odataId))
      setSuccess('Authoriser deleted successfully.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete authoriser')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <h1 className="govuk-heading-l">Authorised Approvers</h1>
      <p className="govuk-body">Add, update or delete authorisers and assign booking office.</p>

      <div className="govuk-!-margin-bottom-6">
        <h2 className="govuk-heading-m">Add authorised approver</h2>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="new-authoriser-name">Authoriser name</label>
          <input
            id="new-authoriser-name"
            className="govuk-input"
            value={createForm.name}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, name: e.target.value }))}
          />
        </div>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="new-authoriser-email">Email</label>
          <input
            id="new-authoriser-email"
            className="govuk-input"
            type="email"
            value={createForm.email}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </div>
        <div className="govuk-form-group">
          <label className="govuk-label" htmlFor="new-authoriser-booking-office">Booking Office</label>
          <select
            id="new-authoriser-booking-office"
            className="govuk-select"
            value={createForm.bookingOfficeId}
            onChange={(e) => setCreateForm((prev) => ({ ...prev, bookingOfficeId: e.target.value }))}
          >
            <option value="">Select booking office</option>
            {bookingOfficeOptions.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="govuk-button"
          data-module="govuk-button"
          disabled={creating}
          onClick={() => void createAuthoriser()}
        >
          {creating ? 'Adding…' : 'Add authorised approver'}
        </button>
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

      {success ? <p className="govuk-body govuk-!-font-weight-bold">{success}</p> : null}
      {loading ? <p className="govuk-body">Loading…</p> : null}

      {!loading ? (
        <table className="govuk-table">
          <thead className="govuk-table__head">
            <tr className="govuk-table__row">
              <th scope="col" className="govuk-table__header">Authoriser name</th>
              <th scope="col" className="govuk-table__header">Email</th>
              <th scope="col" className="govuk-table__header">Booking Office</th>
              <th scope="col" className="govuk-table__header">Actions</th>
            </tr>
          </thead>
          <tbody className="govuk-table__body">
            {rows.map((row, index) => (
              <tr key={row.odataId ?? String(index)} className="govuk-table__row">
                <td className="govuk-table__cell">
                  <input
                    className="govuk-input"
                    value={row.draftName}
                    onChange={(e) => {
                      const next = e.target.value
                      setRows((prev) => prev.map((item) => (item.odataId === row.odataId ? { ...item, draftName: next } : item)))
                    }}
                  />
                </td>
                <td className="govuk-table__cell">
                  <input
                    className="govuk-input"
                    value={row.draftEmail}
                    onChange={(e) => {
                      const next = e.target.value
                      setRows((prev) => prev.map((item) => (item.odataId === row.odataId ? { ...item, draftEmail: next } : item)))
                    }}
                  />
                </td>
                <td className="govuk-table__cell">
                  <select
                    className="govuk-select"
                    value={row.draftBookingOfficeId}
                    onChange={(e) => {
                      const next = e.target.value
                      setRows((prev) => prev.map((item) => (item.odataId === row.odataId ? { ...item, draftBookingOfficeId: next } : item)))
                    }}
                  >
                    <option value="">Select booking office</option>
                    {bookingOfficeOptions.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="govuk-table__cell">
                  <button
                    type="button"
                    className="govuk-button govuk-button--secondary govuk-!-margin-bottom-0"
                    disabled={savingId === row.odataId || deletingId === row.odataId}
                    onClick={() => void saveRow(row)}
                  >
                    {savingId === row.odataId ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="govuk-button govuk-button--warning govuk-!-margin-bottom-0 govuk-!-margin-left-2"
                    disabled={deletingId === row.odataId || savingId === row.odataId}
                    onClick={() => void deleteRow(row)}
                  >
                    {deletingId === row.odataId ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
