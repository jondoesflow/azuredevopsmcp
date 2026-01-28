import { Outlet, Link, useLocation } from 'react-router-dom'
import { useMsal } from '@azure/msal-react'
import type { AccountInfo } from '@azure/msal-browser'
import { env } from '../config'
import { useAuthz } from '../authz/AuthzProvider'
import { canAccessAdmin, canApproveRequests, canBulkAddPassengers, canViewAllRequests, canViewMyRequests } from '../authz/authz'
import govukLogo from '../assets/govuk-logo.png'

export function AppShell() {
  const { pathname } = useLocation()
  const { instance, accounts } = useMsal()
  const account = (instance.getActiveAccount() ?? accounts[0]) as
    | AccountInfo
    | undefined
  const authz = useAuthz()

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

            <nav aria-label="Menu" className="govuk-header__navigation">
              <button
                type="button"
                className="govuk-header__menu-button govuk-js-header-toggle"
                aria-controls="navigation"
                aria-label="Show or hide menu"
              >
                Menu
              </button>
              <ul id="navigation" className="govuk-header__navigation-list">
                <li
                  className={`govuk-header__navigation-item ${pathname === '/' ? 'govuk-header__navigation-item--active' : ''}`}
                >
                  <Link className="govuk-header__link" to="/">
                    Home
                  </Link>
                </li>
                <li
                  className={`govuk-header__navigation-item ${pathname === '/request' ? 'govuk-header__navigation-item--active' : ''}`}
                >
                  <Link className="govuk-header__link" to="/request">
                    Raise request
                  </Link>
                </li>
                {canViewMyRequests(authz.roles) ? (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/my-requests' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/my-requests">
                      My requests
                    </Link>
                  </li>
                ) : null}
                {canApproveRequests(authz.roles) ? (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/booking-queue' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/booking-queue">
                      Queue
                    </Link>
                  </li>
                ) : null}
                {canBulkAddPassengers(authz.roles) ? (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/bulk-add' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/bulk-add">
                      Add passengers
                    </Link>
                  </li>
                ) : null}
                {canViewAllRequests(authz.roles) ? (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/all-requests' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/all-requests">
                      All requests
                    </Link>
                  </li>
                ) : null}
                {canAccessAdmin(authz.roles) ? (
                  <li
                    className={`govuk-header__navigation-item ${pathname === '/admin' ? 'govuk-header__navigation-item--active' : ''}`}
                  >
                    <Link className="govuk-header__link" to="/admin">
                      Admin
                    </Link>
                  </li>
                ) : null}
                {account ? (
                  <li className="govuk-header__navigation-item">
                    <span className="govuk-header__link">{account.name ?? account.username}</span>
                  </li>
                ) : null}
                {account && authz.loading ? (
                  <li className="govuk-header__navigation-item">
                    <span className="govuk-header__link">Checking access…</span>
                  </li>
                ) : null}
                {account && authz.error ? (
                  <li className="govuk-header__navigation-item">
                    <span className="govuk-header__link">Access check failed</span>
                  </li>
                ) : null}
                <li className="govuk-header__navigation-item">
                  {account ? (
                    <button
                      type="button"
                      className="govuk-link govuk-header__link"
                      onClick={() => void instance.logoutRedirect()}
                    >
                      Sign out
                    </button>
                  ) : (
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
                </li>
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
