import { Link, useNavigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuthz } from '../authz/AuthzProvider'
import { isBookingOfficer, isHrPersonnel } from '../authz/authz'
import { env } from '../config'

export function LandingPage() {
  const { instance, accounts } = useMsal()
  const authz = useAuthz()
  const navigate = useNavigate()
  const account = instance.getActiveAccount() ?? accounts[0]

  async function handleStartNow() {
    if (!account) {
      const scope = `${env.dataverseUrl.replace(/\/$/, '')}/.default`
      await instance.loginRedirect({
        scopes: [scope],
        redirectStartPage: window.location.href,
      })
      return
    }

    if (authz.loading) return

    if (isBookingOfficer(authz.roles)) {
      navigate('/booking-queue')
    } else if (isHrPersonnel(authz.roles)) {
      navigate('/hr-request')
    } else {
      navigate('/request')
    }
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
            {account && (isBookingOfficer(authz.roles) || isHrPersonnel(authz.roles)) && (
              <Link to="/admin" className="govuk-link">
                Admin queue
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
