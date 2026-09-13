import { Suspense } from 'react'
import { getCurrentUser, isMockMode } from '@/lib/data'
import { networkOptions, selectedNetworkId } from '@/lib/networks'
import { readSessionCookie } from '@/lib/session-cookie'
import { AppWrapper } from '@/components/app-wrapper'
import { WhoToFollow } from '@/components/who-to-follow'
import { MicroSkeleton } from '@/components/skeleton'
import { RailKeywords } from './rail-keywords'

// Fast cookie reads only. Subgraph scans (keywords, who-to-follow) stream
// in their own Suspense slots so the page body is not blocked (frontend.md §8).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [currentUser, selected, hint] = await Promise.all([
    getCurrentUser(),
    selectedNetworkId(),
    readSessionCookie(),
  ])
  // Cookie address is a hint for the rail — no subgraph wait.
  if (hint?.address && !currentUser.walletAddress) {
    currentUser.walletAddress = hint.address
    currentUser.handle = hint.address.toLowerCase()
  }
  return (
    <AppWrapper
      currentUser={currentUser}
      network={{ selected, options: await networkOptions() }}
      keywordsSlot={
        <Suspense fallback={null}>
          <RailKeywords />
        </Suspense>
      }
      useMock={isMockMode()}
      rightRail={
        <Suspense fallback={<MicroSkeleton label="Loading who to follow" className="py-4" />}>
          <WhoToFollow />
        </Suspense>
      }
    >
      {children}
    </AppWrapper>
  )
}
