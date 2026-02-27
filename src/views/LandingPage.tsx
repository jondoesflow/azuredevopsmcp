import { Link, useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuthz } from '../authz/useAuthz'
import { canAccessAdmin } from '../authz/authz'
import { env } from '../config'
import { loginExternalSignInWithRedirect, loginExternalSignUpWithRedirect } from '../auth/externalMsal'
import { getExternalSession } from '../auth/externalSession'

export function LandingPage() {
  const { instance, accounts } = useMsal()
  const authz = useAuthz()
  const navigate = useNavigate()
  const account = instance.getActiveAccount() ?? accounts[0]
  const externalSession = getExternalSession()
  const isSignedIn = Boolean(account || externalSession)

  async function handleStartNow() {
    if (!isSignedIn) {
      const scope = env.dataverseScope
      await instance.loginRedirect({
        scopes: [scope],
        redirectStartPage: window.location.href,
      })
      return
    }

    if (authz.loading) return
    navigate('/request-options')
  }

  return (
    <div>
      <div className="govuk-grid-row">
        <div className="govuk-grid-column-two-thirds">
          <h1 className="govuk-heading-xl">Raise a passenger request</h1>
          <p className="govuk-body-l">
            Use this service to request passenger transport.
          </p>

          <p className="govuk-body">
            You will need passenger details, document information and preferred travel dates.
          </p>

          <div className="govuk-button-group">
            <button
              type="button"
              onClick={() => void handleStartNow()}
              disabled={authz.loading}
              className="govuk-button"
              data-module="govuk-button"
            >
              {authz.loading ? 'Loading…' : 'Start now'}
            </button>
            {isSignedIn && canAccessAdmin(authz.roles) && (
              <Link to="/admin" className="govuk-link">
                Admin queue
              </Link>
            )}
            {!account && !externalSession && env.aadExternalAuthority && env.aadExternalClientId ? (
              <>
                <button
                  type="button"
                  className="govuk-button govuk-button--secondary"
                  onClick={() => {
                    sessionStorage.setItem('externalOnboardingPending', '1')
                    void loginExternalSignUpWithRedirect()
                  }}
                >
                  Register new external account
                </button>
                <button
                  type="button"
                  className="govuk-button govuk-button--secondary"
                  onClick={() => {
                    sessionStorage.setItem('externalOnboardingPending', '1')
                    void loginExternalSignInWithRedirect()
                  }}
                >
                  External sign in
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
