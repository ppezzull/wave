import { getCurrentUser, getSuggestedProfiles, isMockMode } from '@/lib/data'
import { AppWrapper } from '@/components/app-wrapper'

// Server-resolved identity for the whole app shell: the current user (left-rail
// account chip + nav) and the "who to follow" list (right column). Both flow
// down as props — no business logic runs in the client (frontend.md §8). The
// data MODE is passed down too so the create-drawer picks live compose vs the
// canned mock demo without exposing the server env to the browser.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [currentUser, profiles] = await Promise.all([
    getCurrentUser(),
    getSuggestedProfiles(),
  ])
  return (
    <AppWrapper currentUser={currentUser} profiles={profiles} useMock={isMockMode()}>
      {children}
    </AppWrapper>
  )
}
