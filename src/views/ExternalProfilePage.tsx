import { useEffect, useMemo, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { env } from '../config'
import { getExternalSession } from '../auth/externalSession'
import { useAuthz } from '../authz/useAuthz'

type ExternalContact = {
  id: string
  email: string
  firstName: string
  lastName: string
}

export function ExternalProfilePage() {
  const authz = useAuthz()
  const externalSession = getExternalSession()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [contact, setContact] = useState<ExternalContact | null>(null)

  const lookupUrl = useMemo(() => {
    const base = env.externalOnboardingApiBaseUrl.replace(/\/$/, '')
    const email = encodeURIComponent((externalSession?.email ?? '').trim().toLowerCase())
    return `${base}/api/external-onboarding/contacts/by-email?email=${email}`
  }, [externalSession?.email])

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!externalSession?.email) {
        setLoading(false)
        setError('No external session email found.')
        return
      }

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(lookupUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        })

        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(text || `Failed to load profile (${response.status})`)
        }

        const payload = (await response.json().catch(() => ({}))) as {
          exists?: boolean
          contact?: ExternalContact
        }

        if (cancelled) return

        if (payload.exists && payload.contact) {
          setContact(payload.contact)
        } else {
          setContact(null)
          setError('Your external profile could not be found. Please complete registration.')
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [lookupUrl, externalSession?.email])

  if (!externalSession) return <Navigate to="/" replace />
  if (authz.loading) return <p className="govuk-body">Loading profile…</p>
  if (authz.needsExternalOnboarding) return <Navigate to="/external-onboarding" replace />

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">My profile</h1>
        <p className="govuk-body">Your external Contact profile details are shown below.</p>

        {loading ? <p className="govuk-body">Loading your details…</p> : null}

        {error ? (
          <div className="govuk-warning-text">
            <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
            <strong className="govuk-warning-text__text">
              <span className="govuk-warning-text__assistive">Warning</span>
              {error}
            </strong>
          </div>
        ) : null}

        {contact ? (
          <dl className="govuk-summary-list">
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Email address</dt>
              <dd className="govuk-summary-list__value">{contact.email}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">First name</dt>
              <dd className="govuk-summary-list__value">{contact.firstName || 'Unknown'}</dd>
            </div>
            <div className="govuk-summary-list__row">
              <dt className="govuk-summary-list__key">Surname</dt>
              <dd className="govuk-summary-list__value">{contact.lastName || 'Unknown'}</dd>
            </div>
          </dl>
        ) : null}

        <div className="govuk-button-group">
          <Link to="/request-options" className="govuk-button" data-module="govuk-button">
            Continue
          </Link>
          {!contact ? (
            <Link to="/external-onboarding" className="govuk-link">
              Complete registration
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  )
}
