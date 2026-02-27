import { Link, Navigate } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import { useAuthz } from '../authz/useAuthz'

export function RequestOptionsPage() {
  const { instance, accounts } = useMsal()
  const authz = useAuthz()
  const account = instance.getActiveAccount() ?? accounts[0]

  if (!account) {
    return <Navigate to="/" replace />
  }

  if (authz.loading) {
    return <p className="govuk-body">Loading access options…</p>
  }

  const hasPassenger = authz.roles.includes('passenger')
  const hasHrPersonnel = authz.roles.includes('hr_personel')
  const hasBookingOfficer = authz.roles.includes('booking_officer')
  const hasAuthoriser = authz.roles.includes('authoriser')
  const hasSystemAdmin = authz.roles.includes('system_administrator')

  const showPassengerOption = hasSystemAdmin || (hasPassenger && !hasHrPersonnel && !hasBookingOfficer && !hasAuthoriser)
  const showHrOption = hasHrPersonnel || hasSystemAdmin
  const showAuthoriserOption = hasAuthoriser || hasSystemAdmin
  const showNoRaiseMessage = hasBookingOfficer || hasAuthoriser

  return (
    <div className="govuk-grid-row">
      <div className="govuk-grid-column-two-thirds">
        <h1 className="govuk-heading-l">Choose what you want to do</h1>

        {showPassengerOption && (
          <div className="govuk-inset-text">
            <p className="govuk-body govuk-!-margin-bottom-2">Raise a Passenger request (only)</p>
            <Link className="govuk-button" data-module="govuk-button" to="/request">
              Raise a Passenger request
            </Link>
          </div>
        )}

        {showHrOption && (
          <div className="govuk-inset-text">
            <p className="govuk-body govuk-!-margin-bottom-2">Raise a Passenger request as HR</p>
            <Link className="govuk-button" data-module="govuk-button" to="/hr-request">
              Raise request as HR
            </Link>
          </div>
        )}

        {showAuthoriserOption && (
          <div className="govuk-inset-text">
            <p className="govuk-body govuk-!-margin-bottom-2">Authoriser queue and authorisations</p>
            <Link className="govuk-button govuk-button--secondary" data-module="govuk-button" to="/authorisations">
              Open Authorisations
            </Link>
          </div>
        )}

        {showNoRaiseMessage && !showHrOption && !showPassengerOption && !showAuthoriserOption && (
          <div className="govuk-warning-text">
            <span className="govuk-warning-text__icon" aria-hidden="true">!</span>
            <strong className="govuk-warning-text__text">
              <span className="govuk-warning-text__assistive">Warning</span>
              No raise request option is available for your role.
            </strong>
          </div>
        )}

        {!showPassengerOption && !showHrOption && !showAuthoriserOption && !showNoRaiseMessage && (
          <p className="govuk-body">No request options are available for your current role assignments.</p>
        )}
      </div>
    </div>
  )
}
