import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { DataverseClient } from '../../dataverse/dataverseClient'
import { env } from '../../config'
import type { PassengerComment, PassengerRequestListItem, PaxGroupListItem } from '../../dataverse/types'
import { acquireDataverseAccessToken } from '../../auth/dataverseToken'

type ReviewTab = 'identity' | 'travel' | 'documents' | 'medical' | 'contacts' | 'group'
type QueueTabKey = 'pending' | 'approved' | 'rejected' | 'aircore'

type GroupApprovalItem = {
  groupId: string
  groupName: string
  departingOn?: string
  members: PassengerRequestListItem[]
}

type QueueTabData = {
  passengers: PassengerRequestListItem[]
  groups: GroupApprovalItem[]
}

const TAB_META: Array<{
  key: QueueTabKey
  label: string
  passengerViewGuid?: string
  groupViewGuid?: string
}> = [
  {
    key: 'pending',
    label: 'Pending Authoriser Approval',
    passengerViewGuid: env.viewPassengerPendingAuthoriserApproval,
    groupViewGuid: env.viewGroupPendingAuthoriserApproval,
  },
  {
    key: 'approved',
    label: 'Approved by Authoriser',
    passengerViewGuid: env.viewPassengerApprovedByAuthoriser,
    groupViewGuid: env.viewGroupApprovedByAuthoriser,
  },
  {
    key: 'rejected',
    label: 'Rejected by Booking Officer',
    passengerViewGuid: env.viewPassengerRejectedByBookingOfficer,
    groupViewGuid: env.viewGroupRejectedByBookingOfficer,
  },
  {
    key: 'aircore',
    label: 'Ready for AirCore',
    passengerViewGuid: env.viewPassengerReadyForAirCore,
    groupViewGuid: env.viewGroupReadyForAirCore,
  },
]

const EMPTY_TAB_DATA: QueueTabData = { passengers: [], groups: [] }

function formatDateTime(value: string | undefined): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function formatYesNo(value: boolean | undefined): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return '—'
}

function extractGuidFromODataId(odataId: string | undefined): string | undefined {
  return odataId?.match(/\(([0-9a-f-]{36})\)$/i)?.[1]
}

function departureSortAsc(a: PassengerRequestListItem, b: PassengerRequestListItem): number {
  const aTime = a.departingOn ? new Date(a.departingOn).getTime() : Number.MAX_SAFE_INTEGER
  const bTime = b.departingOn ? new Date(b.departingOn).getTime() : Number.MAX_SAFE_INTEGER
  return aTime - bTime
}

function toGroupItems(groupRows: PaxGroupListItem[], passengerRows: PassengerRequestListItem[]): GroupApprovalItem[] {
  const groupedPassengers = new Map<string, PassengerRequestListItem[]>()
  for (const row of passengerRows) {
    if (!row.groupId) continue
    const members = groupedPassengers.get(row.groupId) ?? []
    members.push(row)
    groupedPassengers.set(row.groupId, members)
  }

  const result: GroupApprovalItem[] = []
  for (const group of groupRows) {
    const groupId = group.id?.trim()
    if (!groupId) continue
    const members = (groupedPassengers.get(groupId) ?? []).sort(departureSortAsc)
    if (members.length === 0) continue
    const lead = members[0]
    result.push({
      groupId,
      groupName: group.name?.trim() || lead?.groupName?.trim() || `Group ${groupId.slice(0, 8)}`,
      departingOn: lead?.departingOn,
      members,
    })
  }

  return result.sort((a, b) => {
    const aTime = a.departingOn ? new Date(a.departingOn).getTime() : Number.MAX_SAFE_INTEGER
    const bTime = b.departingOn ? new Date(b.departingOn).getTime() : Number.MAX_SAFE_INTEGER
    return aTime - bTime
  })
}

function isInvalidViewForEntityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('No Query View exists with the Given Query Id on the Entity Set')
}

export function AdminQueuePage() {
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const accountHomeId = account?.homeAccountId

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => await acquireDataverseAccessToken(instance, acct),
    })
  }, [instance])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<QueueTabKey>('pending')
  const [queueByTab, setQueueByTab] = useState<Record<QueueTabKey, QueueTabData>>({
    pending: EMPTY_TAB_DATA,
    approved: EMPTY_TAB_DATA,
    rejected: EMPTY_TAB_DATA,
    aircore: EMPTY_TAB_DATA,
  })

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState<ReviewTab>('identity')
  const [selected, setSelected] = useState<PassengerRequestListItem | null>(null)

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const [comments, setComments] = useState<PassengerComment[]>([])
  const [commentsBusy, setCommentsBusy] = useState(false)
  const [commentInput, setCommentInput] = useState('')

  const activeTabData = queueByTab[activeTab]

  async function loadComments(target: PassengerRequestListItem, acct: AccountInfo) {
    const bookingId = extractGuidFromODataId(target.odataId)
    if (!bookingId) {
      setComments([])
      return
    }
    setCommentsBusy(true)
    try {
      const items = await client.listPassengerComments(acct, bookingId)
      setComments(items)
    } finally {
      setCommentsBusy(false)
    }
  }

  const loadRequestsForView = useCallback(async (acct: AccountInfo, viewGuid: string | undefined): Promise<PassengerRequestListItem[]> => {
    if (!viewGuid) return []
    try {
      return await client.listPassengerRequestsByView(acct, viewGuid)
    } catch (e) {
      if (isInvalidViewForEntityError(e)) return []
      throw e
    }
  }, [client])

  const refreshQueue = useCallback(async (acct: AccountInfo) => {
    const next: Record<QueueTabKey, QueueTabData> = {
      pending: EMPTY_TAB_DATA,
      approved: EMPTY_TAB_DATA,
      rejected: EMPTY_TAB_DATA,
      aircore: EMPTY_TAB_DATA,
    }

    for (const tab of TAB_META) {
      const [passengerRows, groupRows] = await Promise.all([
        loadRequestsForView(acct, tab.passengerViewGuid),
        tab.groupViewGuid ? client.listGroupsByView(acct, tab.groupViewGuid) : Promise.resolve([]),
      ])

      const normalizedPassengers = [...passengerRows].filter((r) => !r.groupId).sort(departureSortAsc)
      const normalizedGroups = toGroupItems(groupRows, passengerRows)
      next[tab.key] = {
        passengers: normalizedPassengers,
        groups: normalizedGroups,
      }
    }

    setQueueByTab(next)
  }, [client, loadRequestsForView])

  async function openReview(item: PassengerRequestListItem) {
    if (!account) return
    setError(null)
    setSuccess(null)

    const detailed = item.odataId ? await client.getPassengerRequestById(account, item.odataId) : null
    const target = detailed ?? item

    setSelected(target)
    setReviewTab(target.groupId ? 'group' : 'identity')
    setReviewOpen(true)
    await loadComments(target, account)
  }

  async function addComment(subject: string) {
    if (!account || !selected) return
    const bookingId = extractGuidFromODataId(selected.odataId)
    if (!bookingId) return

    const text = commentInput.trim()
    if (!text) return

    setCommentsBusy(true)
    setError(null)
    try {
      await client.addPassengerComment(account, bookingId, subject, text)
      setCommentInput('')
      await loadComments(selected, account)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send comment')
    } finally {
      setCommentsBusy(false)
    }
  }

  async function rejectSelected() {
    if (!account || !selected) return
    const bookingId = extractGuidFromODataId(selected.odataId)
    if (!bookingId) {
      setError('Selected record is missing booking id.')
      return
    }

    const reason = rejectReason.trim()
    if (!reason) {
      setError('Please provide a reason for rejection.')
      return
    }

    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      await client.updateAuthorisationStatusForPassengerBooking(account, bookingId, 'Rejected by Booking Office')
      await client.addPassengerComment(account, bookingId, 'Rejected by Booking Officer', reason)

      setRejectReason('')
      setRejectOpen(false)
      await refreshQueue(account)
      const refreshed = await client.getPassengerRequestById(account, selected.odataId ?? '')
      if (refreshed) {
        setSelected(refreshed)
        await loadComments(refreshed, account)
      }
      setSuccess('Request rejected and returned to Authoriser with comments.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reject request')
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

      const acct = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
      if (!acct) {
        setError('No signed-in account available')
        return
      }

      setBusy(true)
      setError(null)
      setSuccess(null)
      try {
        await refreshQueue(acct)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load requests')
      } finally {
        if (!cancelled) setBusy(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [accountHomeId, instance, accounts, refreshQueue])

  return (
    <div>
      <h1 className="govuk-heading-l">Booking Officers</h1>

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

      <div className="govuk-tabs" data-module="govuk-tabs" style={{ marginBottom: '16px' }}>
        <ul className="govuk-tabs__list">
          {TAB_META.map((tab) => (
            <li key={tab.key} className={`govuk-tabs__list-item ${activeTab === tab.key ? 'govuk-tabs__list-item--selected' : ''}`}>
              <button
                type="button"
                className="govuk-link"
                onClick={() => setActiveTab(tab.key)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {tab.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {busy ? <p className="govuk-body">Loading…</p> : null}

      {!busy && !error && activeTabData.passengers.length === 0 && activeTabData.groups.length === 0 ? (
        <p className="govuk-body">No requests found for this tab.</p>
      ) : null}

      {!busy && !error ? (
        <>
          <h2 className="govuk-heading-m">Passengers</h2>
          <table className="govuk-table">
            <thead className="govuk-table__head">
              <tr className="govuk-table__row">
                <th scope="col" className="govuk-table__header">Passenger</th>
                <th scope="col" className="govuk-table__header">From</th>
                <th scope="col" className="govuk-table__header">To</th>
                <th scope="col" className="govuk-table__header">Status</th>
                <th scope="col" className="govuk-table__header">Departing</th>
              </tr>
            </thead>
            <tbody className="govuk-table__body">
              {activeTabData.passengers.map((r, idx) => (
                <tr className="govuk-table__row" key={r.id ?? String(idx)} style={{ cursor: 'pointer' }} onClick={() => void openReview(r)}>
                  <td className="govuk-table__cell">{`${r.forenames ?? ''} ${r.surname ?? ''}`.trim()}</td>
                  <td className="govuk-table__cell">{r.departingFromIata ?? ''}</td>
                  <td className="govuk-table__cell">{r.destinationIata ?? ''}</td>
                  <td className="govuk-table__cell">{r.transportRequestStatusLabel ?? ''}</td>
                  <td className="govuk-table__cell">{formatDateTime(r.departingOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="govuk-heading-m">Groups</h2>
          <table className="govuk-table">
            <thead className="govuk-table__head">
              <tr className="govuk-table__row">
                <th scope="col" className="govuk-table__header">Group reference</th>
                <th scope="col" className="govuk-table__header">Departure</th>
              </tr>
            </thead>
            <tbody className="govuk-table__body">
              {activeTabData.groups.map((group) => (
                <tr className="govuk-table__row" key={group.groupId} style={{ cursor: 'pointer' }} onClick={() => void openReview(group.members[0])}>
                  <td className="govuk-table__cell">{group.groupName}</td>
                  <td className="govuk-table__cell">{formatDateTime(group.departingOn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}

      {reviewOpen && selected ? (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '1200px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', padding: '24px' }}>
            <h2 className="govuk-heading-m">Review passenger request</h2>
            <p className="govuk-body">{`${selected.forenames ?? ''} ${selected.surname ?? ''}`.trim() || 'Unnamed request'}</p>

            <div className="govuk-grid-row">
              <div className="govuk-grid-column-two-thirds">
                <div className="govuk-button-group" style={{ marginBottom: '16px' }}>
                  <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('identity')}>Identity</button>
                  <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('travel')}>Travel</button>
                  <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('documents')}>Documents</button>
                  <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('medical')}>Medical</button>
                  <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('contacts')}>Contacts</button>
                  {selected.groupId ? <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('group')}>Group</button> : null}
                </div>

                {reviewTab === 'identity' ? (
                  <dl className="govuk-summary-list">
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Surname</dt><dd className="govuk-summary-list__value">{selected.surname ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Forenames</dt><dd className="govuk-summary-list__value">{selected.forenames ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Service staff number</dt><dd className="govuk-summary-list__value">{selected.serviceStaffNumber ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Military/Civilian</dt><dd className="govuk-summary-list__value">{selected.militaryCivilianLabel ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Gender</dt><dd className="govuk-summary-list__value">{selected.genderLabel ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Date of birth</dt><dd className="govuk-summary-list__value">{formatDateTime(selected.dateOfBirth)}</dd></div>
                  </dl>
                ) : null}

                {reviewTab === 'travel' ? (
                  <dl className="govuk-summary-list">
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">From</dt><dd className="govuk-summary-list__value">{selected.departingFromIata ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">To</dt><dd className="govuk-summary-list__value">{selected.destinationIata ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Departing on</dt><dd className="govuk-summary-list__value">{formatDateTime(selected.departingOn)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Returning on</dt><dd className="govuk-summary-list__value">{formatDateTime(selected.returningOn)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Purpose of travel</dt><dd className="govuk-summary-list__value">{selected.purposeOfTravelName ?? '—'}</dd></div>
                  </dl>
                ) : null}

                {reviewTab === 'documents' ? (
                  <dl className="govuk-summary-list">
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Document type</dt><dd className="govuk-summary-list__value">{selected.documentTypeLabel ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Document number</dt><dd className="govuk-summary-list__value">{selected.documentNumber ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passport number</dt><dd className="govuk-summary-list__value">{selected.passportNumber ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passport issue date</dt><dd className="govuk-summary-list__value">{formatDateTime(selected.passportIssueDate)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passport expiry date</dt><dd className="govuk-summary-list__value">{formatDateTime(selected.passportExpiryDate)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passport country</dt><dd className="govuk-summary-list__value">{selected.passportCountryOfIssueName ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Visa number</dt><dd className="govuk-summary-list__value">{selected.visaNumber ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Visa issue date</dt><dd className="govuk-summary-list__value">{formatDateTime(selected.visaIssueDate)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Visa expiry date</dt><dd className="govuk-summary-list__value">{formatDateTime(selected.visaExpiryDate)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Visa country</dt><dd className="govuk-summary-list__value">{selected.visaCountryOfIssueName ?? '—'}</dd></div>
                  </dl>
                ) : null}

                {reviewTab === 'medical' ? (
                  <dl className="govuk-summary-list">
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">AMED</dt><dd className="govuk-summary-list__value">{formatYesNo(selected.amed)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">AMED details</dt><dd className="govuk-summary-list__value">{selected.amedDetails ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Allergy</dt><dd className="govuk-summary-list__value">{formatYesNo(selected.allergy)}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Allergy details</dt><dd className="govuk-summary-list__value">{selected.allergyDetails ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Severity</dt><dd className="govuk-summary-list__value">{selected.severity ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Meal / Dietary</dt><dd className="govuk-summary-list__value">{selected.mealDietaryName ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Meal details</dt><dd className="govuk-summary-list__value">{selected.mealDetails ?? '—'}</dd></div>
                  </dl>
                ) : null}

                {reviewTab === 'contacts' ? (
                  <dl className="govuk-summary-list">
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Point of contact</dt><dd className="govuk-summary-list__value">{selected.pointOfContactName ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Contact email</dt><dd className="govuk-summary-list__value">{selected.contactEmailAddress ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Contact number (working)</dt><dd className="govuk-summary-list__value">{selected.contactNumberWorkingHours ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Contact number (out of hours)</dt><dd className="govuk-summary-list__value">{selected.contactNumberOutOfHours ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Emergency contact</dt><dd className="govuk-summary-list__value">{selected.emergencyContactNumber ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passenger phone</dt><dd className="govuk-summary-list__value">{selected.paxPhoneNumber ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passenger email</dt><dd className="govuk-summary-list__value">{selected.emailOfTraveller ?? '—'}</dd></div>
                  </dl>
                ) : null}

                {reviewTab === 'group' ? (
                  <dl className="govuk-summary-list">
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Group id</dt><dd className="govuk-summary-list__value">{selected.groupId ?? '—'}</dd></div>
                    <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Group name</dt><dd className="govuk-summary-list__value">{selected.groupName ?? '—'}</dd></div>
                  </dl>
                ) : null}
              </div>

              <div className="govuk-grid-column-one-third">
                <h3 className="govuk-heading-s">Comments</h3>
                <div style={{ border: '1px solid #b1b4b6', minHeight: '260px', maxHeight: '360px', overflowY: 'auto', padding: '12px', marginBottom: '12px' }}>
                  {commentsBusy ? <p className="govuk-body-s">Loading comments…</p> : null}
                  {!commentsBusy && comments.length === 0 ? <p className="govuk-body-s">No comments yet.</p> : null}
                  {comments.map((comment) => (
                    <div key={comment.id} style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px solid #d8dde0' }}>
                      <p className="govuk-body-s govuk-!-margin-bottom-1"><strong>{comment.subject ?? 'Comment'}</strong></p>
                      <p className="govuk-body-s govuk-!-margin-bottom-1">{comment.text}</p>
                      <p className="govuk-body-s govuk-!-margin-bottom-0">{comment.createdBy ?? 'Unknown'} · {formatDateTime(comment.createdOn)}</p>
                    </div>
                  ))}
                </div>

                <div className="govuk-form-group">
                  <label className="govuk-label" htmlFor="bo-comment">Add comment</label>
                  <textarea id="bo-comment" className="govuk-textarea" rows={4} value={commentInput} onChange={(e) => setCommentInput(e.target.value)} />
                </div>
                <button type="button" className="govuk-button govuk-button--secondary" disabled={commentsBusy || !commentInput.trim()} onClick={() => void addComment('Booking Officer comment')}>
                  Send comment
                </button>
              </div>
            </div>

            <div className="govuk-button-group" style={{ marginTop: '16px' }}>
              <button type="button" className="govuk-button govuk-button--warning" onClick={() => setRejectOpen(true)}>
                Reject
              </button>
              <button
                type="button"
                className="govuk-button govuk-button--secondary"
                onClick={() => {
                  void (async () => {
                    if (!account || !selected) return
                    const bookingId = extractGuidFromODataId(selected.odataId)
                    if (!bookingId) return
                    setBusy(true)
                    setError(null)
                    setSuccess(null)
                    try {
                      await client.updateAuthorisationStatusForPassengerBooking(account, bookingId, 'Ready for AirCore')
                      await refreshQueue(account)
                      setSuccess('Authorisation status updated to Ready for AirCore.')
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Failed to update Authorisation status')
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                Ready for AirCore
              </button>
              <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectOpen ? (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '700px', background: '#fff', padding: '24px' }}>
            <h2 className="govuk-heading-m">Provide reason for rejection</h2>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="rejection-reason">Reason</label>
              <textarea id="rejection-reason" className="govuk-textarea" rows={6} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            </div>

            <div className="govuk-button-group">
              <button type="button" className="govuk-button govuk-button--warning" disabled={busy || !rejectReason.trim()} onClick={() => void rejectSelected()}>
                Confirm rejection
              </button>
              <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setRejectOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
