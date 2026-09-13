'use client'

import { Suspense, type ReactNode } from 'react'
import type { Profile } from '@/lib/data'
import { DrawerProvider } from './drawer-context'
import { LeftRail } from './left-rail'
import { RightColumn } from './right-column'
import { CreateDrawer } from './create-drawer'
import { PixelBackdrop } from './pixel-backdrop'
import type { RailNetwork } from './left-rail'

export interface CurrentUser extends Profile {
  walletAddress: string
}

interface Props {
  children: ReactNode
  /** Server-resolved right-rail sections (rendered under the search). */
  rightRail?: ReactNode
  /** Streamed "What's new" slot — fetched outside this client shell. */
  keywordsSlot?: ReactNode
  currentUser: CurrentUser
  /** Cookie-selected network — feeds the sidebar switcher. */
  network: RailNetwork
  useMock: boolean
}

// Server-resolved identity (the current user) is passed in from the server
// layout; the rails are presentational. Only the drawer + mobile-menu state
// live here (frontend.md §8 — no business logic on the client). `useMock`
// tells the create-drawer whether to drive the live compose stream or replay
// the canned mock demo.
//
// The pixel-ocean backdrop sits behind the whole cluster; the FEED column and
// the widget carry their own surfaces (the readable islands), the rails and
// page edges show the ocean through.
export function AppWrapper({
  children,
  rightRail,
  keywordsSlot,
  currentUser,
  network,
  useMock,
}: Props) {
  return (
    <DrawerProvider allowDemo={useMock}>
      <div className="min-h-screen">
        <PixelBackdrop />
        {/* Centered X-style cluster: sidebar | feed | discovery */}
        <div className="relative z-10 mx-auto flex w-full max-w-[1265px]">
          <Suspense fallback={null}>
            <LeftRail currentUser={currentUser} network={network} keywordsSlot={keywordsSlot} />
          </Suspense>

          <main className="flex min-w-0 flex-1">
            {/* Feed column — flexes down on narrow viewports, capped at 600px.
                pt-12 clears the fixed mobile header. Same slightly-transparent
                black as the chat widget (glass-surface): the ocean ghosts
                through, cards carry their own surfaces, sticky headers blur
                what scrolls under them. */}
            <div className="glass-surface flex-1 min-w-0 max-w-[600px] mx-auto lg:mx-0 border-x border-wave-border min-h-screen flex flex-col pt-12 md:pt-0">
              {children}
            </div>
            <RightColumn>{rightRail}</RightColumn>
          </main>
        </div>

        <CreateDrawer useMock={useMock} />
      </div>
    </DrawerProvider>
  )
}
