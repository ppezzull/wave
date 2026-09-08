import { getCurrentUser, isMockMode } from '@/lib/data'
import { AppWrapper } from '@/components/app-wrapper'
import { AuthGate } from '@/components/auth-gate'

// Server-resolved identity for the whole app shell: the current user (left-rail
// account chip + nav) flows down as a prop — no business logic runs in the
// client (frontend.md §8). The data MODE is passed down too so the
// create-drawer picks live compose vs the canned mock demo without exposing
// the server env to the browser.
//
// AuthGate: signed-out → `/` (landing). Signed-in users may visit `/` without
// being bounced to /explore — the landing right panel shows identity + logout.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const currentUser = await getCurrentUser()
  return (
    <AuthGate>
      <AppWrapper currentUser={currentUser} useMock={isMockMode()}>
        {children}
      </AppWrapper>
    </AuthGate>
  )
}
