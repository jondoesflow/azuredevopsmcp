import type { ReactElement } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '../ui/AppShell'
import { LandingPage } from '../views/LandingPage.tsx'
import { PassengerRequestPage } from '../views/PassengerRequestPage.tsx'
import { AdminQueuePage } from '../views/admin/AdminQueuePage.tsx'
import { MyRequestsPage } from '../views/MyRequestsPage.tsx'
import { HrBulkAddPage } from '../views/hr/HrBulkAddPage.tsx'
import { AllRequestsPage } from '../views/admin/AllRequestsPage.tsx'
import { AuthorisedApproversPage } from '../views/admin/AuthorisedApproversPage.tsx'
import { AuthorisationsPage } from '../views/authorisation/AuthorisationsPage.tsx'
import { RequestOptionsPage } from '../views/RequestOptionsPage.tsx'
import { ExternalOnboardingPage } from '../views/ExternalOnboardingPage.tsx'
import { ExternalProfilePage } from '../views/ExternalProfilePage.tsx'
import { useAuthz } from '../authz/useAuthz'
import { canAccessAdmin, canApproveRequests, canBulkAddPassengers, canRaiseHrRequest, canRaisePassengerSelfRequest, canViewAllRequests, canViewMyRequests } from '../authz/authz'
import { getExternalSession } from '../auth/externalSession'

function ExternalOnboardingGate({ children }: { children: ReactElement }) {
  const authz = useAuthz()
  const location = useLocation()
  const pendingExternalOnboarding = sessionStorage.getItem('externalOnboardingPending') === '1'
  const externalSession = getExternalSession()
  const hasExternalAuthContext = authz.isExternalUser || Boolean(externalSession)

  if (authz.loading) return children

  if (pendingExternalOnboarding && hasExternalAuthContext && authz.needsExternalOnboarding && location.pathname !== '/external-onboarding') {
    return <Navigate to="/external-onboarding" replace />
  }

  if (pendingExternalOnboarding && hasExternalAuthContext && !authz.needsExternalOnboarding) {
    sessionStorage.removeItem('externalOnboardingPending')
    if (location.pathname !== '/my-profile') {
      return <Navigate to="/my-profile" replace />
    }
  }

  if (authz.isExternalUser && authz.needsExternalOnboarding && location.pathname !== '/external-onboarding') {
    return <Navigate to="/external-onboarding" replace />
  }

  if (authz.isExternalUser && !authz.needsExternalOnboarding && location.pathname === '/external-onboarding') {
    return <Navigate to="/my-profile" replace />
  }

  return children
}

function AdminGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canAccessAdmin(authz.roles)) return <Navigate to="/" replace />
  return <AdminQueuePage />
}

function AuthorisedApproversGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canAccessAdmin(authz.roles)) return <Navigate to="/" replace />
  return <AuthorisedApproversPage />
}

function MyRequestsGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (authz.isExternalUser) return <Navigate to="/my-profile" replace />
  if (!canViewMyRequests(authz.roles)) return <Navigate to="/" replace />
  return <MyRequestsPage />
}

function AuthorisationsGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canApproveRequests(authz.roles)) return <Navigate to="/" replace />
  return <AuthorisationsPage />
}

function HrBulkAddGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canBulkAddPassengers(authz.roles)) return <Navigate to="/" replace />
  return <HrBulkAddPage />
}

function AllRequestsGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canViewAllRequests(authz.roles)) return <Navigate to="/" replace />
  return <AllRequestsPage />
}

function HrRequestGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canRaiseHrRequest(authz.roles)) return <Navigate to="/request-options" replace />
  return <PassengerRequestPage />
}

function PassengerRequestGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canRaisePassengerSelfRequest(authz.roles)) return <Navigate to="/request-options" replace />
  return <PassengerRequestPage />
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<ExternalOnboardingGate><AppShell /></ExternalOnboardingGate>}>
        <Route index element={<LandingPage />} />
        <Route path="/external-onboarding" element={<ExternalOnboardingPage />} />
        <Route path="/my-profile" element={<ExternalProfilePage />} />
        <Route path="/request-options" element={<RequestOptionsPage />} />
        <Route path="/request" element={<PassengerRequestGuard />} />
        <Route path="/admin" element={<AdminGuard />} />
        <Route path="/authorised-approvers" element={<AuthorisedApproversGuard />} />
        <Route path="/my-requests" element={<MyRequestsGuard />} />
        <Route path="/booking-queue" element={<Navigate to="/authorisations" replace />} />
        <Route path="/authorisations" element={<AuthorisationsGuard />} />
        <Route path="/bulk-add" element={<HrBulkAddGuard />} />
        <Route path="/hr-request" element={<HrRequestGuard />} />
        <Route path="/all-requests" element={<AllRequestsGuard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
