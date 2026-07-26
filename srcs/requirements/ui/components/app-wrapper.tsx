'use client'

import { Suspense } from 'react'
import { DrawerProvider } from './drawer-context'
import { LeftRail } from './left-rail'
import { RightColumn } from './right-column'
import { CreateDrawer } from './create-drawer'

export function AppWrapper({ children }: { children: React.ReactNode }) {
  return (
    <DrawerProvider>
      <div className="min-h-screen bg-wave-bg">
        {/* Centered X-style cluster: sidebar | feed | discovery */}
        <div className="mx-auto flex w-full max-w-[1265px]">
          <Suspense fallback={null}>
            <LeftRail />
          </Suspense>

          <main className="flex min-w-0 flex-1">
            {/* Feed column — flexes down on narrow viewports, capped at 600px.
                pt-12 clears the fixed mobile header. */}
            <div className="flex-1 min-w-0 max-w-[600px] mx-auto lg:mx-0 border-x border-wave-border min-h-screen flex flex-col pt-12 md:pt-0">
              {children}
            </div>
            <RightColumn />
          </main>
        </div>

        <CreateDrawer />
      </div>
    </DrawerProvider>
  )
}
