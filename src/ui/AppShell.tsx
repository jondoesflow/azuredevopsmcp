import { useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { env } from '../config'
import { useAuthz } from '../authz/AuthzProvider'
import { isHrPersonnel, isBookingOfficer, isPassengerOnly, canAccessAdmin } from '../authz/authz'
import govukLogo from '../assets/govuk-logo.png'

export function AppShell() {
  const { pathname } = useLocation()
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as
    | AccountInfo
    | undefined
  const authz = useAuthz()
  const [bookingOfficeOpen, setBookingOfficeOpen] = useState(false)

  const showPassengerNav = isPassengerOnly(authz.roles)
  const showHrNav = isHrPersonnel(authz.roles)
  const showBookingOfficeNav = isBookingOfficer(authz.roles)

  return (
    <div className="govuk-template__body">
      <a href="#main-content" className="govuk-skip-link" data-module="govuk-skip-link">
        Skip to main content
      </a>

      <header className="govuk-header patb-govuk-header" data-module="govuk-header">
        <div className="govuk-header__container govuk-width-container">
          <div className="govuk-header__logo">
            <a href="/" className="govuk-header__link govuk-header__link--homepage">
              <img src={govukLogo} alt="GOV.UK" className="patb-govuk-logo" />
            </a>
          </div>

          <div className="govuk-header__content">
            <a href="/" className="govuk-header__link govuk-header__service-name">
              Passenger requests
            </a>

            {/* User info - top right */}
            <div className="patb-header-user">
              {account && authz.loading && (
                <span className="govuk-header__link">Checking access…</span>
              )}
              {account && authz.error && (
                <span className="govuk-header__link">Access check failed</span>
              )}
              {account && (
                <>
                  <span className="govuk-header__link patb-user-name">{account.name ?? account.username}</span>
                  <button
                    type="button"
                    className="govuk-link govuk-header__link"
                    onClick={() => void instance.logoutRedirect()}
                  >
                    Sign out
                  </button>
                </>
              )}
              {!account && (
                <button
                  type="button"
                  className="govuk-link govuk-header__link"
                  onClick={() =>
                    void instance.loginRedirect({
                      scopes: [`${env.dataverseUrl.replace(/\/$/, '')}/.default`],
                      redirectStartPage: window.location.href,
                    })
                  }
                >
                  Sign in
                </button>
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
                {showPassengerNav && (
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

                {/* Booking Office dropdown - for Booking Officers, System Admin */}
                {showBookingOfficeNav && (
                  <li
                    className={`govuk-header__navigation-item patb-dropdown ${bookingOfficeOpen ? 'patb-dropdown--open' : ''}`}
                  >
                    <button
                      type="button"
                      className="govuk-header__link patb-dropdown-toggle"
                      onClick={() => setBookingOfficeOpen(!bookingOfficeOpen)}
                      aria-expanded={bookingOfficeOpen}
                      aria-haspopup="true"
                    >
                      Booking Office
                      <span className="patb-dropdown-arrow" aria-hidden="true">▼</span>
                    </button>
                    {bookingOfficeOpen && (
                      <ul className="patb-dropdown-menu">
                        <li>
                          <Link
                            className={`govuk-header__link ${pathname === '/booking-queue' ? 'patb-dropdown-item--active' : ''}`}
                            to="/booking-queue"
                            onClick={() => setBookingOfficeOpen(false)}
                          >
                            Queue
                          </Link>
                        </li>
                        <li>
                          <Link
                            className={`govuk-header__link ${pathname === '/all-requests' ? 'patb-dropdown-item--active' : ''}`}
                            to="/all-requests"
                            onClick={() => setBookingOfficeOpen(false)}
                          >
                            All requests
                          </Link>
                        </li>
                      </ul>
                    )}
                  </li>
                )}

                {/* Admin - for System Admin, Booking Officers, HR Personnel */}
                {canAccessAdmin(authz.roles) && (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/admin' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/admin">
                      Admin
                    </Link>
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
