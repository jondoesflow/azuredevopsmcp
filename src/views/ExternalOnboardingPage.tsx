import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccountInfo } from '@azure/msal-browser'
import { useMsal } from '@azure/msal-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { env } from '../config'
import { useAuthz } from '../authz/useAuthz'
import { getExternalSession, getRememberedExternalEmail, setExternalSession } from '../auth/externalSession'

type OnboardingFieldErrors = {
  email?: string
  firstName?: string
  lastName?: string
}

function toNormalizedEmail(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim().toLowerCase()
  return trimmed.includes('@') ? trimmed : ''
}

function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  const normalized = trimmed.toLowerCase()
  if (normalized === 'unknown' || normalized === 'n/a' || normalized === 'na' || normalized === '-') {
    return ''
  }
  return trimmed
}

function getAccountNames(accountName: string): { firstName: string; lastName: string } {
  const trimmed = accountName.trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const parts = trimmed.split(' ').filter(Boolean)
  if (parts.length <= 1) {
    return { firstName: sanitizeName(trimmed), lastName: '' }
  }
  return {
    firstName: sanitizeName(parts.slice(0, -1).join(' ')),
    lastName: sanitizeName(parts.slice(-1).join(' ')),
  }
}

export function ExternalOnboardingPage() {
  const { instance, accounts } = useMsal()
  const navigate = useNavigate()
  const authz = useAuthz()
  const account = (instance.getActiveAccount() ?? accounts[0]) as AccountInfo | undefined
  const externalSession = getExternalSession()
  const rememberedEmail = getRememberedExternalEmail()

  const externalOnboardingApiUrl = useMemo(() => {
    const base = env.externalOnboardingApiBaseUrl.replace(/\/$/, '')
    return `${base}/api/external-onboarding/contacts`
  }, [])

  const accountName = (externalSession?.name ?? account?.name ?? '').trim()
  const accountNames = getAccountNames(accountName)
  const accountClaims = (account?.idTokenClaims ?? {}) as Record<string, unknown>
  const derivedEmail =
    toNormalizedEmail(externalSession?.email) ||
    toNormalizedEmail(rememberedEmail) ||
    toNormalizedEmail(account?.username) ||
    toNormalizedEmail(accountClaims.email) ||
    (Array.isArray(accountClaims.emails) ? toNormalizedEmail(accountClaims.emails[0]) : '') ||
    toNormalizedEmail(accountClaims.preferred_username)

  const [firstName, setFirstName] = useState(
    sanitizeName(externalSession?.firstName) ||
      sanitizeName(accountClaims.given_name) ||
      accountNames.firstName,
  )
  const [lastName, setLastName] = useState(
    sanitizeName(externalSession?.lastName) ||
      sanitizeName(accountClaims.family_name) ||
      accountNames.lastName,
  )

  const [email, setEmail] = useState(derivedEmail)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<OnboardingFieldErrors>({})
  const errorSummaryRef = useRef<HTMLDivElement | null>(null)

  const pendingExternalOnboarding = sessionStorage.getItem('externalOnboardingPending') === '1'

  useEffect(() => {
    if (!email && derivedEmail) setEmail(derivedEmail)
  }, [derivedEmail, email])

  useEffect(() => {
    if (!error && !fieldErrors.email && !fieldErrors.firstName && !fieldErrors.lastName) return
    errorSummaryRef.current?.focus()
  }, [error, fieldErrors])

  if (!account && !externalSession) {
    if (pendingExternalOnboarding) {
      sessionStorage.removeItem('externalOnboardingPending')
    }
    return <Navigate to="/" replace />
  }
  if (authz.loading) return <p className="govuk-body">Loading…</p>
  if (!pendingExternalOnboarding && (!authz.isExternalUser || !authz.needsExternalOnboarding)) {
    return <Navigate to="/request-options" replace />
  }

  function validateFields(): OnboardingFieldErrors {
    const nextErrors: OnboardingFieldErrors = {}
    const normalizedEmail = toNormalizedEmail(email)
    if (!normalizedEmail) {
      nextErrors.email = 'Enter your email address'
    }
    if (!firstName.trim()) {
      nextErrors.firstName = 'Enter your first name'
    }
    if (!lastName.trim()) {
      nextErrors.lastName = 'Enter your last name'
    }
    return nextErrors
  }

  async function submit() {
    const normalizedEmail = toNormalizedEmail(email)
    const trimmedFirstName = firstName.trim()
    const trimmedLastName = lastName.trim()

    const validationErrors = validateFields()
    if (validationErrors.email || validationErrors.firstName || validationErrors.lastName) {
      setFieldErrors(validationErrors)
      setError('There is a problem with your submission')
      return
    }

    setBusy(true)
    setError(null)
    setFieldErrors({})

    try {
      const response = await fetch(externalOnboardingApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          email: normalizedEmail,
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
        }),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `External onboarding API failed (${response.status})`)
      }

      setExternalSession({
        email: normalizedEmail,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        name: `${trimmedFirstName} ${trimmedLastName}`.trim(),
      })
      sessionStorage.removeItem('externalOnboardingPending')
      authz.refresh()
      navigate('/my-profile', { replace: true })
    } catch (e) {
      setFieldErrors({})
      setError(e instanceof Error ? e.message : 'Failed to complete external user registration')
    } finally {
      setBusy(false)
    }
  }

  const showErrorSummary = Boolean(error || fieldErrors.email || fieldErrors.firstName || fieldErrors.lastName)
  const emailHasError = Boolean(fieldErrors.email)
  const firstNameHasError = Boolean(fieldErrors.firstName)
  const lastNameHasError = Boolean(fieldErrors.lastName)
  const canCompleteRegistration = Boolean(
    toNormalizedEmail(email) && firstName.trim() && lastName.trim() && !busy,
  )

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">Complete your passenger registration</h1>
        <p className="govuk-body">
          To access passenger features, please complete this one-time registration. This creates your Contact profile in the system.
        </p>

        {showErrorSummary ? (
          <div
            className="govuk-error-summary"
            data-module="govuk-error-summary"
            ref={errorSummaryRef}
            tabIndex={-1}
            aria-labelledby="external-onboarding-error-summary-title"
            role="alert"
          >
            <h2 className="govuk-error-summary__title" id="external-onboarding-error-summary-title">
              There is a problem
            </h2>
            <div className="govuk-error-summary__body">
              <ul className="govuk-list govuk-error-summary__list">
                {fieldErrors.firstName ? (
                  <li>
                    <a href="#external-first-name">{fieldErrors.firstName}</a>
                  </li>
                ) : null}
                {fieldErrors.email ? (
                  <li>
                    <a href="#external-email">{fieldErrors.email}</a>
                  </li>
                ) : null}
                {fieldErrors.lastName ? (
                  <li>
                    <a href="#external-last-name">{fieldErrors.lastName}</a>
                  </li>
                ) : null}
                {error && !fieldErrors.email && !fieldErrors.firstName && !fieldErrors.lastName ? <li>{error}</li> : null}
              </ul>
            </div>
          </div>
        ) : null}

        <form noValidate>
          <div className={`govuk-form-group ${emailHasError ? 'govuk-form-group--error' : ''}`}>
            <label className="govuk-label" htmlFor="external-email">Email address</label>
            {fieldErrors.email ? (
              <p id="external-email-error" className="govuk-error-message">
                <span className="govuk-visually-hidden">Error:</span> {fieldErrors.email}
              </p>
            ) : null}
            <div id="external-email-hint" className="govuk-hint">
              This is the email from your external sign-in.
            </div>
            <input
              id="external-email"
              className={`govuk-input ${emailHasError ? 'govuk-input--error' : ''}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={fieldErrors.email ? 'external-email-error external-email-hint' : 'external-email-hint'}
            />
          </div>

          <div className={`govuk-form-group ${firstNameHasError ? 'govuk-form-group--error' : ''}`}>
            <label className="govuk-label" htmlFor="external-first-name">First name</label>
            {fieldErrors.firstName ? (
              <p id="external-first-name-error" className="govuk-error-message">
                <span className="govuk-visually-hidden">Error:</span> {fieldErrors.firstName}
              </p>
            ) : null}
            <input
              id="external-first-name"
              className={`govuk-input ${firstNameHasError ? 'govuk-input--error' : ''}`}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              maxLength={100}
              aria-describedby={fieldErrors.firstName ? 'external-first-name-error' : undefined}
            />
          </div>

          <div className={`govuk-form-group ${lastNameHasError ? 'govuk-form-group--error' : ''}`}>
            <label className="govuk-label" htmlFor="external-last-name">Surname</label>
            {fieldErrors.lastName ? (
              <p id="external-last-name-error" className="govuk-error-message">
                <span className="govuk-visually-hidden">Error:</span> {fieldErrors.lastName}
              </p>
            ) : null}
            <input
              id="external-last-name"
              className={`govuk-input ${lastNameHasError ? 'govuk-input--error' : ''}`}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              maxLength={100}
              aria-describedby={fieldErrors.lastName ? 'external-last-name-error' : undefined}
            />
          </div>

          <button
            type="button"
            className="govuk-button"
            data-module="govuk-button"
            disabled={!canCompleteRegistration}
            onClick={() => void submit()}
          >
            {busy ? 'Saving…' : 'Complete registration'}
          </button>
        </form>
      </div>
    </div>
  )
}
