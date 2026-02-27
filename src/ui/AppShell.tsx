import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { env } from '../config'
import { useAuthz } from '../authz/useAuthz'
import { isHrPersonnel, isPassengerOnly, canAccessAdmin, canApproveRequests } from '../authz/authz'
import govukLogo from '../assets/govuk-logo.png'
import { clearExternalSession, getExternalSession } from '../auth/externalSession'
import { loginExternalSignInWithRedirect, loginExternalSignUpWithRedirect } from '../auth/externalMsal'

export function AppShell() {
  const { pathname } = useLocation()
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as
    | AccountInfo
    | undefined
  const externalSession = getExternalSession()
  const internalTenantId = env.aadTenantId?.trim().toLowerCase()
  const accountTenantId = account?.homeAccountId?.split('.')[1]?.toLowerCase()
  const isExternalAccountContext = Boolean(accountTenantId && internalTenantId && accountTenantId !== internalTenantId)
  const accountDisplay = account?.name && account.name.toLowerCase() !== 'unknown'
    ? account.name
    : account?.username
  const isSignedIn = Boolean(account || externalSession)
  const displayName = externalSession?.name ?? externalSession?.email ?? accountDisplay ?? 'External user'
  const authz = useAuthz()
  const [bookingOfficeOpen, setBookingOfficeOpen] = useState(false)
  const [bookingOfficersOpen, setBookingOfficersOpen] = useState(false)

  const showPassengerNav = isPassengerOnly(authz.roles)
  const showHrNav = isHrPersonnel(authz.roles)
  const showBookingOfficeNav = canApproveRequests(authz.roles)

  return (
    <div className="govuk-template__body">
      <a href="#main-content" className="govuk-skip-link" data-module="govuk-skip-link">
        Skip to main content
      </a>

      <header className="govuk-header flightbooking-govuk-header" data-module="govuk-header">
        <div className="govuk-header__container govuk-width-container">
          <div className="govuk-header__logo">
            <a href="/" className="govuk-header__link govuk-header__link--homepage">
              <img src={govukLogo} alt="GOV.UK" className="flightbooking-govuk-logo" />
            </a>
          </div>

          <div className="govuk-header__content">
            <a href="/" className="govuk-header__link govuk-header__service-name">
              Passenger requests
            </a>

            {/* User info - top right */}
            <div className="flightbooking-header-user">
              {isSignedIn && authz.loading && (
                <span className="govuk-header__link">Checking access…</span>
              )}
              {isSignedIn && authz.error && !externalSession && !isExternalAccountContext && (
                <span className="govuk-header__link">Access check failed</span>
              )}
              {isSignedIn && (
                <>
                  <span className="govuk-header__link flightbooking-user-name">{displayName}</span>
                  <button
                    type="button"
                    className="govuk-link govuk-header__link"
                    onClick={() => {
                      if (account) {
                        void instance.logoutRedirect()
                        return
                      }
                      clearExternalSession()
                      sessionStorage.removeItem('externalOnboardingPending')
                      window.location.assign('/')
                    }}
                  >
                    Sign out
                  </button>
                </>
              )}
              {!isSignedIn && (
                <>
                  <button
                    type="button"
                    className="govuk-link govuk-header__link"
                    onClick={() =>
                      void instance.loginRedirect({
                        scopes: [env.dataverseScope],
                        redirectStartPage: window.location.href,
                      })
                    }
                  >
                    Sign in (internal)
                  </button>
                  {env.aadExternalAuthority && env.aadExternalClientId ? (
                    <>
                      <button
                        type="button"
                        className="govuk-link govuk-header__link"
                        onClick={() => {
                          sessionStorage.setItem('externalOnboardingPending', '1')
                          void loginExternalSignUpWithRedirect()
                        }}
                      >
                        Register new external account
                      </button>
                      <button
                        type="button"
                        className="govuk-link govuk-header__link"
                        onClick={() => {
                          sessionStorage.setItem('externalOnboardingPending', '1')
                          void loginExternalSignInWithRedirect()
                        }}
                      >
                        External sign in
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>

            <nav aria-label="Main navigation" className="govuk-header__navigation">
              <ul id="navigation" className="govuk-header__navigation-list">
                {/* Home - visible to all */}
                <li
                  className={`govuk-header__navigation-item ${pathname === '/' ? 'govuk-header__navigation-item--active' : ''}`}
                >
                  <Link className="govuk-header__link" to="/">
                    Home
                  </Link>
                </li>

                {/* Raise Request - for Passengers only */}
                {showPassengerNav && (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/request' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/request">
                      Raise request
                    </Link>
                  </li>
                )}

                {/* Raise Request as HR - for HR Personnel, Booking Officers, System Admin */}
                {showHrNav && (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/hr-request' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/hr-request">
                      Raise request as HR
                    </Link>
                  </li>
                )}

                {/* My Requests - for Passengers */}
                {showPassengerNav && !authz.isExternalUser && (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/my-requests' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/my-requests">
                      My requests
                    </Link>
                  </li>
                )}

                {/* All Requests - for HR Personnel (requests they've raised) */}
                {showHrNav && !showBookingOfficeNav && (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/all-requests' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/all-requests">
                      All requests
                    </Link>
                  </li>
                )}

                {/* Authoriser dropdown - for Authorisers, System Admin */}
                {showBookingOfficeNav && (
                  <li
                    className={`govuk-header__navigation-item flightbooking-dropdown ${bookingOfficeOpen ? 'flightbooking-dropdown--open' : ''}`}
                  >
                    <button
                      type="button"
                      className="govuk-header__link flightbooking-dropdown-toggle"
                      onClick={() => setBookingOfficeOpen(!bookingOfficeOpen)}
                      aria-expanded={bookingOfficeOpen}
                      aria-haspopup="true"
                    >
                      Authoriser
                      <span className="flightbooking-dropdown-arrow" aria-hidden="true">▼</span>
                    </button>
                    {bookingOfficeOpen && (
                      <ul className="flightbooking-dropdown-menu">
                        <li>
                          <Link
                            className={`govuk-header__link ${pathname === '/authorisations' ? 'flightbooking-dropdown-item--active' : ''}`}
                            to="/authorisations"
                            onClick={() => setBookingOfficeOpen(false)}
                          >
                            Authorisations
                          </Link>
                        </li>
                      </ul>
                    )}
                  </li>
                )}

                {/* Booking Officers dropdown - for System Admin, Booking Officers, HR Personnel */}
                {canAccessAdmin(authz.roles) && (
                  <li
                    className={`govuk-header__navigation-item flightbooking-dropdown ${bookingOfficersOpen ? 'flightbooking-dropdown--open' : ''}`}
                  >
                    <button
                      type="button"
                      className="govuk-header__link flightbooking-dropdown-toggle"
                      onClick={() => setBookingOfficersOpen(!bookingOfficersOpen)}
                      aria-expanded={bookingOfficersOpen}
                      aria-haspopup="true"
                    >
                      Booking Officers
                      <span className="flightbooking-dropdown-arrow" aria-hidden="true">▼</span>
                    </button>
                    {bookingOfficersOpen && (
                      <ul className="flightbooking-dropdown-menu">
                        <li>
                          <Link
                            className={`govuk-header__link ${pathname === '/admin' ? 'flightbooking-dropdown-item--active' : ''}`}
                            to="/admin"
                            onClick={() => setBookingOfficersOpen(false)}
                          >
                            Approvals
                          </Link>
                        </li>
                        <li>
                          <Link
                            className={`govuk-header__link ${pathname === '/authorised-approvers' ? 'flightbooking-dropdown-item--active' : ''}`}
                            to="/authorised-approvers"
                            onClick={() => setBookingOfficersOpen(false)}
                          >
                            Authorised Approvers
                          </Link>
                        </li>
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            </nav>
          </div>
        </div>
      </header>

      <div className="govuk-width-container">
        <main className="govuk-main-wrapper" id="main-content">
          <Outlet />
        </main>
      </div>

      <footer className="govuk-footer">
        <div className="govuk-width-container">
          <div className="govuk-footer__meta">
            <div className="govuk-footer__meta-item govuk-footer__meta-item--grow">
              <span className="govuk-footer__licence-description">Passenger Requests POC</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
