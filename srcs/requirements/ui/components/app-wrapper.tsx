'use client'

import { Suspense } from 'react'
import type { ENSProfile } from '@/lib/data'
import { DrawerProvider } from './drawer-context'
import { LeftRail } from './left-rail'
import { RightColumn } from './right-column'
import { CreateDrawer } from './create-drawer'

export interface CurrentUser extends ENSProfile {
  walletAddress: string
}

interface Props {
  children: React.ReactNode
  currentUser: CurrentUser
  profiles: ENSProfile[]
  useMock: boolean
}

// Server-resolved identity (the current user + the "who to follow" list) is
// passed in from the server layout; the rails are presentational. Only the
// drawer + mobile-menu state live here (frontend.md §8 — no business logic on
// the client). `useMock` tells the create-drawer whether to drive the live
// compose stream or replay the canned mock demo.
export function AppWrapper({ children, currentUser, profiles, useMock }: Props) {
  return (
    <DrawerProvider>
      <div className="min-h-screen bg-wave-bg">
        {/* Centered X-style cluster: sidebar | feed | discovery */}
        <div className="mx-auto flex w-full max-w-[1265px]">
          <Suspense fallback={null}>
            <LeftRail currentUser={currentUser} />
          </Suspense>

          <main className="flex min-w-0 flex-1">
            {/* Feed column — flexes down on narrow viewports, capped at 600px.
                pt-12 clears the fixed mobile header. */}
            <div className="flex-1 min-w-0 max-w-[600px] mx-auto lg:mx-0 border-x border-wave-border min-h-screen flex flex-col pt-12 md:pt-0">
              {children}
            </div>
            <RightColumn currentUser={currentUser} profiles={profiles} />
          </main>
        </div>

        <CreateDrawer useMock={useMock} />
      </div>
    </DrawerProvider>
  )
}
