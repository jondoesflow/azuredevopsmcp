export type ExternalSession = {
  email: string
  name?: string
  firstName?: string
  lastName?: string
}

const KEY = 'externalUserSession'
const REMEMBERED_EMAIL_KEY = 'externalUserEmail'

export function getExternalSession(): ExternalSession | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<ExternalSession>
    const email = typeof parsed.email === 'string' ? parsed.email.trim().toLowerCase() : ''
    const name = typeof parsed.name === 'string' ? parsed.name.trim() : undefined
    const firstName = typeof parsed.firstName === 'string' ? parsed.firstName.trim() : undefined
    const lastName = typeof parsed.lastName === 'string' ? parsed.lastName.trim() : undefined
    if (!email) return null
    return { email, name, firstName, lastName }
  } catch {
    return null
  }
}

export function setExternalSession(session: ExternalSession): void {
  const email = session.email.trim().toLowerCase()
  const name = session.name?.trim() || undefined
  const firstName = session.firstName?.trim() || undefined
  const lastName = session.lastName?.trim() || undefined
  sessionStorage.setItem(KEY, JSON.stringify({ email, name, firstName, lastName }))
  localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
}

export function clearExternalSession(): void {
  sessionStorage.removeItem(KEY)
}

export function getRememberedExternalEmail(): string {
  const value = localStorage.getItem(REMEMBERED_EMAIL_KEY)
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function setRememberedExternalEmail(email: string): void {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return
  localStorage.setItem(REMEMBERED_EMAIL_KEY, normalized)
}
