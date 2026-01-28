import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MsalProvider } from '@azure/msal-react'
import { initAll } from 'govuk-frontend'
import './index.css'
import App from './App.tsx'
import { msalInstance } from './auth/msalInstance'
import { AuthzProvider } from './authz/AuthzProvider'

async function bootstrap() {
  await msalInstance.initialize()
  const response = await msalInstance.handleRedirectPromise()

  if (response?.account) {
    msalInstance.setActiveAccount(response.account)
  } else {
    const account = msalInstance.getAllAccounts()[0]
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
