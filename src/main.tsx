import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MsalProvider } from '@azure/msal-react'
import { initAll } from 'govuk-frontend'
import './index.css'
import App from './App.tsx'
import { msalInstance } from './auth/msalInstance'
import { AuthzProvider } from './authz/AuthzProvider'
import { env } from './config'
import { handleExternalRedirectResult, loginExternalSignUpWithRedirect } from './auth/externalMsal'

const EXTERNAL_AUTO_SIGNUP_RETRY_KEY = 'externalAutoSignupRetry'

async function bootstrap() {
  const pendingExternalOnboarding = sessionStorage.getItem('externalOnboardingPending') === '1'
  try {
    const handledExternalRedirect = await handleExternalRedirectResult()
    if (handledExternalRedirect) {
      sessionStorage.removeItem(EXTERNAL_AUTO_SIGNUP_RETRY_KEY)
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '')
    const isMissingExternalUser = /AADSTS50020/i.test(message)
    const alreadyRetried = sessionStorage.getItem(EXTERNAL_AUTO_SIGNUP_RETRY_KEY) === '1'

    if (pendingExternalOnboarding && isMissingExternalUser && !alreadyRetried) {
      sessionStorage.setItem(EXTERNAL_AUTO_SIGNUP_RETRY_KEY, '1')
      await loginExternalSignUpWithRedirect()
      return
    }

    if (pendingExternalOnboarding) {
      console.error('External MSAL redirect handling failed', error)
    }
  }

  await msalInstance.initialize()
  let response = null
  try {
    response = await msalInstance.handleRedirectPromise()
  } catch (error) {
    console.error('MSAL redirect handling failed', error)
  }

  if (response?.account) {
    msalInstance.setActiveAccount(response.account)
  } else {
    const accounts = msalInstance.getAllAccounts()
    const internalTenantId = env.aadTenantId?.trim().toLowerCase()
    const preferredInternal = accounts.find((candidate) => {
      const homeTenantId = candidate.homeAccountId?.split('.')[1]?.toLowerCase()
      return Boolean(internalTenantId && homeTenantId && homeTenantId === internalTenantId)
    })
    const account = preferredInternal ?? accounts[0]
    if (account) msalInstance.setActiveAccount(account)
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <BrowserRouter>
          <AuthzProvider>
            <App />
          </AuthzProvider>
        </BrowserRouter>
      </MsalProvider>
    </StrictMode>,
  )

  document.body.classList.add('govuk-frontend-supported')
  initAll()
}

void bootstrap()
