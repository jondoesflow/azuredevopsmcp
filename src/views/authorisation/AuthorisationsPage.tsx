import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { DataverseClient } from '../../dataverse/dataverseClient'
import { env } from '../../config'
import type { AuthorisationRecord, AuthoriserListItem, LookupOption, PassengerRequestListItem } from '../../dataverse/types'
import { LookupAutocompleteInput } from '../../ui/LookupAutocompleteInput'
import { acquireDataverseAccessToken } from '../../auth/dataverseToken'

type GroupApprovalItem = {
  groupId: string
  groupName: string
  departingOn?: string
  members: PassengerRequestListItem[]
}

type ReviewTab = 'identity' | 'travel' | 'documents' | 'medical' | 'contacts' | 'group'
type Decision = 'reject' | 'authorise' | 'cancel'

type AuthorisationForm = {
  authorisationReference: string
  authoriserName: string
  contactNumber: string
  dateOfAuthorisation: string
  email: string
  uin: string
  receivingUnitOrFamilyAddress: string
  purposeOfTravelCodeId: string
  rankGradeId: string
  serviceCodeId: string
  travelCodeId: string
  jfetNo: string
  jpan: string
  alternativeExceptionalAuthority: string
  reasonForTravelVisit: string
  specialRequests: string
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function toDateInput(value: string | undefined): string {
  if (!value) return todayDate()
  return value.slice(0, 10)
}

function formatDate(value: string | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-GB')
}

function formatYesNo(value: boolean | undefined): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  return '—'
}

function departureSortAsc(a: PassengerRequestListItem, b: PassengerRequestListItem): number {
  const aTime = a.departingOn ? new Date(a.departingOn).getTime() : Number.MAX_SAFE_INTEGER
  const bTime = b.departingOn ? new Date(b.departingOn).getTime() : Number.MAX_SAFE_INTEGER
  return aTime - bTime
}

function createEmptyForm(defaultName = '', defaultEmail = ''): AuthorisationForm {
  return {
    authorisationReference: '',
    authoriserName: defaultName,
    contactNumber: '',
    dateOfAuthorisation: todayDate(),
    email: defaultEmail,
    uin: '',
    receivingUnitOrFamilyAddress: '',
    purposeOfTravelCodeId: '',
    rankGradeId: '',
    serviceCodeId: '',
    travelCodeId: '',
    jfetNo: '',
    jpan: '',
    alternativeExceptionalAuthority: '',
    reasonForTravelVisit: '',
    specialRequests: '',
  }
}

function toGroups(items: PassengerRequestListItem[]): GroupApprovalItem[] {
  const grouped = new Map<string, PassengerRequestListItem[]>()
  for (const item of items) {
    if (!item.groupId) continue
    const existing = grouped.get(item.groupId) ?? []
    existing.push(item)
    grouped.set(item.groupId, existing)
  }

  return Array.from(grouped.entries())
    .map(([groupId, members]) => {
      const sorted = [...members].sort(departureSortAsc)
      const lead = sorted[0]
      return {
        groupId,
        groupName: lead?.groupName?.trim() || `Group ${groupId.slice(0, 8)}`,
        departingOn: lead?.departingOn,
        members: sorted,
      }
    })
    .sort((a, b) => {
      const aTime = a.departingOn ? new Date(a.departingOn).getTime() : Number.MAX_SAFE_INTEGER
      const bTime = b.departingOn ? new Date(b.departingOn).getTime() : Number.MAX_SAFE_INTEGER
      return aTime - bTime
    })
}

function bookingGuid(item: PassengerRequestListItem): string | undefined {
  return item.odataId?.match(/\(([0-9a-f-]{36})\)$/i)?.[1]
}

function authorisationGuid(record: AuthorisationRecord | null): string | undefined {
  if (!record) return undefined
  if (record.id && /^[0-9a-f-]{36}$/i.test(record.id)) return record.id
  return record.odataId?.match(/\(([0-9a-f-]{36})\)$/i)?.[1]
}

export function AuthorisationsPage() {
  const { instance, accounts } = useMsal()
  const account = useMemo(() => (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined, [instance, accounts])

  const client = useMemo(() => {
    return new DataverseClient({
      getAccessToken: async (acct) => await acquireDataverseAccessToken(instance, acct),
    })
  }, [instance])

  const [pendingPassengers, setPendingPassengers] = useState<PassengerRequestListItem[]>([])
  const [pendingGroups, setPendingGroups] = useState<GroupApprovalItem[]>([])
  const [rejectedPassengers, setRejectedPassengers] = useState<PassengerRequestListItem[]>([])
  const [rejectedGroups, setRejectedGroups] = useState<GroupApprovalItem[]>([])
  const [groupMembersById, setGroupMembersById] = useState<Record<string, PassengerRequestListItem[]>>({})

  const [rankOptions, setRankOptions] = useState<LookupOption[]>([])
  const [purposeOptions, setPurposeOptions] = useState<LookupOption[]>([])
  const [serviceCodeOptions, setServiceCodeOptions] = useState<LookupOption[]>([])
  const [travelCodeOptions, setTravelCodeOptions] = useState<LookupOption[]>([])

  const [currentAuthoriser, setCurrentAuthoriser] = useState<AuthoriserListItem | null>(null)

  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewTab, setReviewTab] = useState<ReviewTab>('identity')
  const [selected, setSelected] = useState<PassengerRequestListItem | null>(null)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [form, setForm] = useState<AuthorisationForm>(createEmptyForm())

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const refreshQueue = useCallback(async (activeAccount: AccountInfo, authoriser: AuthoriserListItem | null) => {
    const allRequests = await client.listAllPassengerRequests(activeAccount)
    const filtered = authoriser?.id
      ? allRequests.filter((r) => (r.authoriserId ?? '').toLowerCase() === (authoriser.id ?? '').toLowerCase())
      : allRequests

    const statuses = await Promise.allSettled(
      filtered.map(async (item) => {
        const id = bookingGuid(item)
        if (!id) return { item, status: 'Pending Authoriser Approval' }
        const auth = await client.getAuthorisationForPassengerBooking(activeAccount, id)
        return { item, status: auth?.authorisationStatusLabel ?? 'Pending Authoriser Approval' }
      }),
    )

    const pending: PassengerRequestListItem[] = []
    const rejected: PassengerRequestListItem[] = []

    for (const statusResult of statuses) {
      if (statusResult.status !== 'fulfilled') continue
      const label = (statusResult.value.status ?? '').trim().toLowerCase()
      if (label === 'rejected by booking office') {
        rejected.push(statusResult.value.item)
      } else if (label === 'pending authoriser approval' || label.length === 0) {
        pending.push(statusResult.value.item)
      }
    }

    const pendingSolo = pending.filter((r) => !r.groupId).sort(departureSortAsc)
    const rejectedSolo = rejected.filter((r) => !r.groupId).sort(departureSortAsc)
    const pendingGrouped = toGroups(pending)
    const rejectedGrouped = toGroups(rejected)

    setPendingPassengers(pendingSolo)
    setRejectedPassengers(rejectedSolo)
    setPendingGroups(pendingGrouped)
    setRejectedGroups(rejectedGrouped)
    setGroupMembersById(Object.fromEntries([...pendingGrouped, ...rejectedGrouped].map((g) => [g.groupId, g.members])))
  }, [client])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!account) return

      setLoading(true)
      setError(null)
      setSuccess(null)

      try {
        const [rankResult, purposeResult, serviceResult, travelResult] = await Promise.all([
          client.listLookupOptions(account, 'ranks').catch(() => []),
          client.listLookupOptions(account, 'purposeoftravels').catch(() => []),
          client.listLookupOptions(account, 'servicecodes').catch(() => []),
          client.listLookupOptions(account, 'travelcodes').catch(() => []),
        ])

        if (cancelled) return
        setRankOptions(rankResult)
        setPurposeOptions(purposeResult)
        setServiceCodeOptions(serviceResult)
        setTravelCodeOptions(travelResult)

        let resolvedAuthoriser: AuthoriserListItem | null = null
        if (env.viewActiveAuthorisers) {
          const activeAuthorisers = await client.listAuthorisersByView(account, env.viewActiveAuthorisers)
          const candidates = [
            account.username,
            account.name,
            account.username?.split('@')[0],
          ]
            .map((x) => (x ?? '').trim().toLowerCase())
            .filter((x) => x.length > 0)

          resolvedAuthoriser =
            activeAuthorisers.find((a) => {
              const name = (a.authoriserName ?? '').trim().toLowerCase()
              const email = (a.email ?? '').trim().toLowerCase()
              return candidates.includes(name) || candidates.includes(email)
            }) ?? null
        }

        if (cancelled) return
        setCurrentAuthoriser(resolvedAuthoriser)
        await refreshQueue(account, resolvedAuthoriser)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load authorisation queue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [account, client, refreshQueue])

  async function openReview(item: PassengerRequestListItem, groupId: string | null = null) {
    if (!account) return

    setError(null)
    setSuccess(null)

    try {
      const detailed = item.odataId ? await client.getPassengerRequestById(account, item.odataId) : null
      const selectedItem = detailed ?? item
      const id = bookingGuid(selectedItem)
      const existing = id ? await client.getAuthorisationForPassengerBooking(account, id) : null

      setSelected(selectedItem)
      setSelectedGroupId(groupId)
      setReviewTab(groupId ? 'group' : 'identity')
      setForm(
        existing
          ? {
              authorisationReference: existing.authorisationReference,
              authoriserName: existing.authoriserName,
              contactNumber: existing.contactNumber,
              dateOfAuthorisation: toDateInput(existing.dateOfAuthorisation),
              email: existing.email,
              uin: existing.uin,
              receivingUnitOrFamilyAddress: existing.receivingUnitOrFamilyAddress,
              purposeOfTravelCodeId: existing.purposeOfTravelCodeId,
              rankGradeId: existing.rankGradeId,
              serviceCodeId: existing.serviceCodeId,
              travelCodeId: existing.travelCodeId,
              jfetNo: existing.jfetNo ?? '',
              jpan: existing.jpan ?? '',
              alternativeExceptionalAuthority: existing.alternativeExceptionalAuthority ?? '',
              reasonForTravelVisit: existing.reasonForTravelVisit ?? '',
              specialRequests: existing.specialRequests ?? '',
            }
          : createEmptyForm(currentAuthoriser?.authoriserName ?? account.name ?? '', currentAuthoriser?.email ?? account.username ?? ''),
      )
      setReviewOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load request details')
    }
  }

  function validateForAuthorise(): string | null {
    const required: Array<[keyof AuthorisationForm, string]> = [
      ['authoriserName', 'Authoriser name'],
      ['contactNumber', 'Contact number'],
      ['dateOfAuthorisation', 'Date of authorisation'],
      ['email', 'Email'],
      ['uin', 'UIN'],
      ['receivingUnitOrFamilyAddress', 'Receiving unit or family address'],
      ['reasonForTravelVisit', 'Reason for travel/visit'],
      ['purposeOfTravelCodeId', 'Purpose of travel code'],
      ['rankGradeId', 'Rank/Grade'],
      ['serviceCodeId', 'Service code'],
      ['travelCodeId', 'Travel code'],
    ]

    for (const [field, label] of required) {
      if (!form[field].trim()) return `${label} is mandatory.`
    }
    return null
  }

  async function submitDecision(decision: Decision) {
    if (!account || !selected) return

    if (decision === 'authorise') {
      const validation = validateForAuthorise()
      if (validation) {
        setError(validation)
        return
      }
    }

    const targets = selectedGroupId ? groupMembersById[selectedGroupId] ?? [] : [selected]
    if (targets.length === 0) {
      setError('No target requests found.')
      return
    }

    const statusLabel =
      decision === 'authorise'
        ? 'Approved by Authoriser'
        : decision === 'reject'
          ? 'In Progress'
          : 'Cancelled'

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      for (const target of targets) {
        const detailed = target.odataId ? await client.getPassengerRequestById(account, target.odataId) : target
        if (!detailed?.odataId) continue
        const id = bookingGuid(detailed)
        if (!id) continue

        const computedReference =
          form.authorisationReference.trim() || `${form.authoriserName.trim() || 'AUTH'}-${form.dateOfAuthorisation || todayDate()}`

        const payload: AuthorisationRecord = {
          passengerBookingId: id,
          authorisationReference: computedReference,
          authoriserName: form.authoriserName.trim(),
          contactNumber: form.contactNumber.trim(),
          dateOfAuthorisation: form.dateOfAuthorisation,
          email: form.email.trim(),
          uin: form.uin.trim(),
          receivingUnitOrFamilyAddress: form.receivingUnitOrFamilyAddress.trim(),
          purposeOfTravelCodeId: form.purposeOfTravelCodeId,
          rankGradeId: form.rankGradeId,
          serviceCodeId: form.serviceCodeId,
          travelCodeId: form.travelCodeId,
          jfetNo: form.jfetNo.trim() || undefined,
          jpan: form.jpan.trim() || undefined,
          alternativeExceptionalAuthority: form.alternativeExceptionalAuthority.trim() || undefined,
          reasonForTravelVisit: form.reasonForTravelVisit.trim() || undefined,
          specialRequests: form.specialRequests.trim() || undefined,
          authorisationStatusLabel: statusLabel,
          bookingOfficeId: decision === 'authorise' ? currentAuthoriser?.bookingOfficeId : undefined,
          stateCode: decision === 'cancel' ? 1 : 0,
          statusCode: decision === 'cancel' ? 2 : undefined,
        }

        await client.saveAuthorisation(account, payload)

        const persistedAuthorisation = await client.getAuthorisationForPassengerBooking(account, id)
        const persistedAuthorisationId = authorisationGuid(persistedAuthorisation)
        if (persistedAuthorisationId) {
          await client.updatePassengerBookingAuthorisationReference(account, id, persistedAuthorisationId)
        }

        const groupId = (detailed.groupId ?? target.groupId ?? '').trim()
        if (groupId && persistedAuthorisationId) {
          await client.updateGroupAuthorisationReference(account, groupId, persistedAuthorisationId)
        }

        if (decision === 'reject' && detailed.createdById) {
          await client.reassignPassengerBookingOwnerToUser(
            account,
            { odataId: detailed.odataId, etag: detailed.etag },
            detailed.createdById,
          )
        }
      }

      await refreshQueue(account, currentAuthoriser)
      setReviewOpen(false)
      setSelected(null)
      setSelectedGroupId(null)

      if (decision === 'authorise') {
        setSuccess('Request authorisation saved as Approved by Authoriser.')
      }
      if (decision === 'reject') {
        setSuccess('Request returned to passenger/group as In Progress and ownership reassigned to lead passenger.')
      }
      if (decision === 'cancel') {
        setSuccess('Request marked as Cancelled and set to inactive.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to process decision')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-full">
        <h1 className="govuk-heading-l">Authorisations</h1>

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

        {!loading && pendingPassengers.length === 0 && pendingGroups.length === 0 && rejectedPassengers.length === 0 && rejectedGroups.length === 0 ? (
          <p className="govuk-body">No passenger requests to approve.</p>
        ) : null}

        {!loading ? (
          <>
            <h2 className="govuk-heading-m">Pending Authoriser Approval - Passengers</h2>
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Passenger</th>
                  <th className="govuk-table__header">From</th>
                  <th className="govuk-table__header">To</th>
                  <th className="govuk-table__header">Departure</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {pendingPassengers.map((r, index) => (
                  <tr key={r.odataId ?? String(index)} className="govuk-table__row">
                    <td className="govuk-table__cell">
                      <button type="button" className="govuk-link" onClick={() => void openReview(r)}>
                        {`${r.forenames ?? ''} ${r.surname ?? ''}`.trim() || 'Unnamed request'}
                      </button>
                    </td>
                    <td className="govuk-table__cell">{r.departingFromIata ?? '—'}</td>
                    <td className="govuk-table__cell">{r.destinationIata ?? '—'}</td>
                    <td className="govuk-table__cell">{formatDate(r.departingOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="govuk-heading-m">Pending Authoriser Approval - Groups</h2>
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Group reference</th>
                  <th className="govuk-table__header">Departure</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {pendingGroups.map((g) => (
                  <tr key={g.groupId} className="govuk-table__row">
                    <td className="govuk-table__cell">
                      <button type="button" className="govuk-link" onClick={() => void openReview(g.members[0], g.groupId)}>
                        {g.groupName}
                      </button>
                    </td>
                    <td className="govuk-table__cell">{formatDate(g.departingOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="govuk-heading-m">Rejected by Booking Office - Passengers</h2>
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Passenger</th>
                  <th className="govuk-table__header">From</th>
                  <th className="govuk-table__header">To</th>
                  <th className="govuk-table__header">Departure</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {rejectedPassengers.map((r, index) => (
                  <tr key={r.odataId ?? String(index)} className="govuk-table__row">
                    <td className="govuk-table__cell">
                      <button type="button" className="govuk-link" onClick={() => void openReview(r)}>
                        {`${r.forenames ?? ''} ${r.surname ?? ''}`.trim() || 'Unnamed request'}
                      </button>
                    </td>
                    <td className="govuk-table__cell">{r.departingFromIata ?? '—'}</td>
                    <td className="govuk-table__cell">{r.destinationIata ?? '—'}</td>
                    <td className="govuk-table__cell">{formatDate(r.departingOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h2 className="govuk-heading-m">Rejected by Booking Office - Groups</h2>
            <table className="govuk-table">
              <thead className="govuk-table__head">
                <tr className="govuk-table__row">
                  <th className="govuk-table__header">Group reference</th>
                  <th className="govuk-table__header">Departure</th>
                </tr>
              </thead>
              <tbody className="govuk-table__body">
                {rejectedGroups.map((g) => (
                  <tr key={g.groupId} className="govuk-table__row">
                    <td className="govuk-table__cell">
                      <button type="button" className="govuk-link" onClick={() => void openReview(g.members[0], g.groupId)}>
                        {g.groupName}
                      </button>
                    </td>
                    <td className="govuk-table__cell">{formatDate(g.departingOn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>

      {reviewOpen && selected ? (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '1100px', maxHeight: '90vh', overflowY: 'auto', background: '#fff', padding: '24px' }}>
            <h2 className="govuk-heading-m">Review and approve request</h2>
            <p className="govuk-body">{`${selected.forenames ?? ''} ${selected.surname ?? ''}`.trim() || 'Unnamed request'}</p>

            <div className="govuk-button-group" style={{ marginBottom: '16px' }}>
              <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('identity')}>Identity</button>
              <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('travel')}>Travel</button>
              <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('documents')}>Documents</button>
              <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('medical')}>Medical</button>
              <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('contacts')}>Contacts</button>
              {selectedGroupId ? <button type="button" className="govuk-button govuk-button--secondary" onClick={() => setReviewTab('group')}>Group</button> : null}
            </div>

            {reviewTab === 'identity' ? (
              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Surname</dt><dd className="govuk-summary-list__value">{selected.surname ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Forenames</dt><dd className="govuk-summary-list__value">{selected.forenames ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Service staff number</dt><dd className="govuk-summary-list__value">{selected.serviceStaffNumber ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Military/Civilian</dt><dd className="govuk-summary-list__value">{selected.militaryCivilianLabel ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Gender</dt><dd className="govuk-summary-list__value">{selected.genderLabel ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Date of birth</dt><dd className="govuk-summary-list__value">{formatDate(selected.dateOfBirth)}</dd></div>
              </dl>
            ) : null}

            {reviewTab === 'travel' ? (
              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">From</dt><dd className="govuk-summary-list__value">{selected.departingFromIata ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">To</dt><dd className="govuk-summary-list__value">{selected.destinationIata ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Departing on</dt><dd className="govuk-summary-list__value">{formatDate(selected.departingOn)}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Returning on</dt><dd className="govuk-summary-list__value">{formatDate(selected.returningOn)}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Purpose of travel</dt><dd className="govuk-summary-list__value">{selected.purposeOfTravelName ?? '—'}</dd></div>
              </dl>
            ) : null}

            {reviewTab === 'documents' ? (
              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Document type</dt><dd className="govuk-summary-list__value">{selected.documentTypeLabel ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Document number</dt><dd className="govuk-summary-list__value">{selected.documentNumber ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passport number</dt><dd className="govuk-summary-list__value">{selected.passportNumber ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passport issue date</dt><dd className="govuk-summary-list__value">{formatDate(selected.passportIssueDate)}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Passport expiry date</dt><dd className="govuk-summary-list__value">{formatDate(selected.passportExpiryDate)}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Visa number</dt><dd className="govuk-summary-list__value">{selected.visaNumber ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Visa expiry date</dt><dd className="govuk-summary-list__value">{formatDate(selected.visaExpiryDate)}</dd></div>
              </dl>
            ) : null}

            {reviewTab === 'medical' ? (
              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">AMED</dt><dd className="govuk-summary-list__value">{formatYesNo(selected.amed)}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">AMED details</dt><dd className="govuk-summary-list__value">{selected.amedDetails ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Allergy</dt><dd className="govuk-summary-list__value">{formatYesNo(selected.allergy)}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Allergy details</dt><dd className="govuk-summary-list__value">{selected.allergyDetails ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Meal details</dt><dd className="govuk-summary-list__value">{selected.mealDetails ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Special requests</dt><dd className="govuk-summary-list__value">{selected.specialRequests ?? '—'}</dd></div>
              </dl>
            ) : null}

            {reviewTab === 'contacts' ? (
              <dl className="govuk-summary-list">
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Point of contact</dt><dd className="govuk-summary-list__value">{selected.pointOfContactName ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Contact email</dt><dd className="govuk-summary-list__value">{selected.contactEmailAddress ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Contact number (working)</dt><dd className="govuk-summary-list__value">{selected.contactNumberWorkingHours ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Contact number (out of hours)</dt><dd className="govuk-summary-list__value">{selected.contactNumberOutOfHours ?? '—'}</dd></div>
                <div className="govuk-summary-list__row"><dt className="govuk-summary-list__key">Emergency contact</dt><dd className="govuk-summary-list__value">{selected.emergencyContactNumber ?? '—'}</dd></div>
              </dl>
            ) : null}

            {reviewTab === 'group' && selectedGroupId ? (
              <table className="govuk-table">
                <thead className="govuk-table__head">
                  <tr className="govuk-table__row">
                    <th className="govuk-table__header">Passenger</th>
                    <th className="govuk-table__header">Departure</th>
                  </tr>
                </thead>
                <tbody className="govuk-table__body">
                  {(groupMembersById[selectedGroupId] ?? []).map((member) => (
                    <tr key={member.odataId ?? member.id} className="govuk-table__row">
                      <td className="govuk-table__cell">{`${member.forenames ?? ''} ${member.surname ?? ''}`.trim()}</td>
                      <td className="govuk-table__cell">{formatDate(member.departingOn)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            <h3 className="govuk-heading-s" style={{ marginTop: '24px' }}>Authorisation details</h3>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-name">Name *</label>
              <input className="govuk-input" id="authoriser-name" value={form.authoriserName} onChange={(e) => setForm((f) => ({ ...f, authoriserName: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-email">Email *</label>
              <input className="govuk-input" id="authoriser-email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-contact">Contact Number *</label>
              <input className="govuk-input" id="authoriser-contact" value={form.contactNumber} onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-date">Date *</label>
              <input className="govuk-input" id="authoriser-date" type="date" value={form.dateOfAuthorisation} onChange={(e) => setForm((f) => ({ ...f, dateOfAuthorisation: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-uin">UIN *</label>
              <input className="govuk-input" id="authoriser-uin" value={form.uin} onChange={(e) => setForm((f) => ({ ...f, uin: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-receiving">Receiving Unit or Family Address *</label>
              <textarea className="govuk-textarea" id="authoriser-receiving" rows={3} value={form.receivingUnitOrFamilyAddress} onChange={(e) => setForm((f) => ({ ...f, receivingUnitOrFamilyAddress: e.target.value }))} />
            </div>

            <LookupAutocompleteInput label="Rank/Grade" required valueId={form.rankGradeId} options={rankOptions} onChange={(id) => setForm((f) => ({ ...f, rankGradeId: id }))} />
            <LookupAutocompleteInput label="Service Code" required valueId={form.serviceCodeId} options={serviceCodeOptions} onChange={(id) => setForm((f) => ({ ...f, serviceCodeId: id }))} />
            <LookupAutocompleteInput label="Travel Code" required valueId={form.travelCodeId} options={travelCodeOptions} onChange={(id) => setForm((f) => ({ ...f, travelCodeId: id }))} />
            <LookupAutocompleteInput label="Purpose of Travel Code" required valueId={form.purposeOfTravelCodeId} options={purposeOptions} onChange={(id) => setForm((f) => ({ ...f, purposeOfTravelCodeId: id }))} />

            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-jfet">JFET No or Staff Clearance No</label>
              <input className="govuk-input" id="authoriser-jfet" value={form.jfetNo} onChange={(e) => setForm((f) => ({ ...f, jfetNo: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-jpan">JPAN</label>
              <input className="govuk-input" id="authoriser-jpan" value={form.jpan} onChange={(e) => setForm((f) => ({ ...f, jpan: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-alt">Alternative/Exceptional Authority</label>
              <input className="govuk-input" id="authoriser-alt" value={form.alternativeExceptionalAuthority} onChange={(e) => setForm((f) => ({ ...f, alternativeExceptionalAuthority: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-reason">Reason for Visit/Travel *</label>
              <textarea className="govuk-textarea" id="authoriser-reason" rows={3} value={form.reasonForTravelVisit} onChange={(e) => setForm((f) => ({ ...f, reasonForTravelVisit: e.target.value }))} />
            </div>
            <div className="govuk-form-group">
              <label className="govuk-label" htmlFor="authoriser-special">Special requests</label>
              <textarea className="govuk-textarea" id="authoriser-special" rows={3} value={form.specialRequests} onChange={(e) => setForm((f) => ({ ...f, specialRequests: e.target.value }))} />
            </div>

            <div className="govuk-button-group" style={{ marginTop: '16px' }}>
              <button type="button" className="govuk-button govuk-button--warning" disabled={saving} onClick={() => void submitDecision('reject')}>
                {saving ? 'Saving…' : 'Reject back to Passenger/Group'}
              </button>
              <button type="button" className="govuk-button" disabled={saving} onClick={() => void submitDecision('authorise')}>
                {saving ? 'Saving…' : 'Authorise'}
              </button>
              <button type="button" className="govuk-button govuk-button--secondary" disabled={saving} onClick={() => void submitDecision('cancel')}>
                {saving ? 'Saving…' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
