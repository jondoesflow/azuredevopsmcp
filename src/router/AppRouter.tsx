import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../ui/AppShell'
import { LandingPage } from '../views/LandingPage.tsx'
import { PassengerRequestPage } from '../views/PassengerRequestPage.tsx'
import { AdminQueuePage } from '../views/admin/AdminQueuePage.tsx'
import { MyRequestsPage } from '../views/MyRequestsPage.tsx'
import { BookingOfficerQueuePage } from '../views/booking/BookingOfficerQueuePage.tsx'
import { HrBulkAddPage } from '../views/hr/HrBulkAddPage.tsx'
import { HrRequestPage } from '../views/hr/HrRequestPage.tsx'
import { AllRequestsPage } from '../views/admin/AllRequestsPage.tsx'
import { useAuthz } from '../authz/AuthzProvider'
import { canAccessAdmin, canApproveRequests, canBulkAddPassengers, canViewAllRequests, canViewMyRequests, isHrPersonnel } from '../authz/authz'

function AdminGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canAccessAdmin(authz.roles)) return <Navigate to="/" replace />
  return <AdminQueuePage />
}

function MyRequestsGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canViewMyRequests(authz.roles)) return <Navigate to="/" replace />
  return <MyRequestsPage />
}

function BookingOfficerQueueGuard() {
  const authz = useAuthz()
  if (authz.loading) return null
  if (!canApproveRequests(authz.roles)) return <Navigate to="/" replace />
  return <BookingOfficerQueuePage />
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
  if (!isHrPersonnel(authz.roles)) return <Navigate to="/" replace />
  return <HrRequestPage />
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<LandingPage />} />
        <Route path="/request" element={<PassengerRequestPage />} />
        <Route path="/admin" element={<AdminGuard />} />
        <Route path="/my-requests" element={<MyRequestsGuard />} />
        <Route path="/booking-queue" element={<BookingOfficerQueueGuard />} />
        <Route path="/bulk-add" element={<HrBulkAddGuard />} />
        <Route path="/hr-request" element={<HrRequestGuard />} />
        <Route path="/all-requests" element={<AllRequestsGuard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
