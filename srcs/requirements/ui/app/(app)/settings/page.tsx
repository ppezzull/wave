import { getCurrentUser } from '@/lib/data'
import { SettingsForm } from './settings-form'

// Server-resolved current user (Privy session → wallet → ENS). Until Privy is
// wired, getCurrentUser() returns an empty profile (truth) — the form renders
// empty fields, never fabricated identity.
export default async function SettingsPage() {
  const user = await getCurrentUser()
  return <SettingsForm user={user} />
}
