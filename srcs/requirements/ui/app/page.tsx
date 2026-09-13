import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { PixelWaves } from '@/components/ui/pixel/animations/pixel-waves'
import { LandingSignIn } from '@/components/landing-sign-in'
import { ThemeToggle } from '@/components/theme-toggle'
import { RailNetworkSwitcher } from '@/components/network-selector'
import { networkOptions, selectedNetworkId } from '@/lib/networks'

const CREDIT_LINK =
  'inline-flex items-center rounded-sm opacity-90 transition-all duration-[220ms] hover:scale-[1.08] hover:opacity-100 hover:brightness-110 hover:drop-shadow-[0_6px_16px_rgba(15,52,96,0.28)] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-wave-text'

function CreditLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      title={href}
      className={CREDIT_LINK}
    >
      {children}
    </a>
  )
}

export const metadata: Metadata = {
  title: 'Sign in · wave',
  description:
    'Every pool makes a wave. Describe a strategy in words, ship it on-chain.',
}

export default async function LandingPage() {
  // Same cookie-backed selection as the sidebar rail — the landing shows it
  // top-left so the read network is visible (and switchable) pre-sign-in.
  const networkSelected = await selectedNetworkId()

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-y-auto overflow-x-hidden bg-wave-bg md:overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0">
        <PixelWaves
          className="h-full w-full"
          colors={['#0F3460', '#2A9D8F', '#26A69A', '#FFF3E0']}
          pixelSize={16}
          gap={2}
          speed={0.8}
          opacity={0.9}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-wave-bg via-wave-bg/70 to-transparent md:via-wave-bg/40" />
      </div>

      <header className="relative z-20 flex h-16 shrink-0 items-center justify-between px-5 md:px-10">
        <RailNetworkSwitcher
          selected={networkSelected}
          options={await networkOptions()}
          dropUp={false}
        />
        <ThemeToggle collapsed />
      </header>

      <div className="relative z-10 grid flex-1 grid-cols-1 items-center gap-8 px-5 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:gap-6 md:px-10">
        <section
          className="hidden flex-col justify-center md:flex"
          aria-labelledby="hero-headline"
        >
          <div className="mb-6 flex items-center justify-center">
            <Image
              src="/wave-logo.png"
              alt=""
              width={120}
              height={120}
              className="animate-float h-28 w-28 drop-shadow-[0_12px_32px_rgba(15,52,96,0.25)] lg:h-36 lg:w-36"
              aria-hidden="true"
            />
          </div>
          <h1
            id="hero-headline"
            className="text-balance text-center font-sans font-extrabold leading-[1.05] tracking-tight text-wave-text"
            style={{ fontSize: 'clamp(2.5rem, 4.5vw, 4rem)' }}
          >
            every pool makes a wave
          </h1>
          <h2 className="mx-auto mt-4 max-w-lg text-pretty text-center font-sans text-xl leading-relaxed text-wave-muted">
            Describe it in words. Ship it on-chain.
          </h2>

          {/* Credits */}
          <div className="mx-auto mt-8 flex w-full max-w-lg flex-col items-center gap-6">
            <div className="flex flex-col items-center gap-4">
              <span className="font-sans text-[12px] font-medium uppercase tracking-[0.18em] text-wave-muted">
                Powered by
              </span>
              <div className="flex items-center justify-center gap-5">
                {/* Original brand colors — the old brightness-0 invert washed
                    the unicorn into a white silhouette. */}
                <CreditLink href="https://1inch.io" label="1inch">
                  <Image
                    src="/1inch-1inch-logo-3869602491.png"
                    alt="1inch"
                    width={140}
                    height={30}
                    className="h-[30px] w-auto object-contain"
                  />
                </CreditLink>
                <CreditLink href="https://thegraph.com" label="The Graph">
                  <Image
                    src="/thegraph-logo-color.svg"
                    alt="The Graph"
                    width={140}
                    height={30}
                    className="h-[32px] w-auto object-contain"
                  />
                </CreditLink>
                {/* Source asset is black-on-white (no alpha) — lifted to a
                    white mark on transparency (ledger-mark-light.png) so it
                    floats like the other two, no badge square. */}
                <CreditLink href="https://www.ledger.com" label="Ledger">
                  <Image
                    src="/ledger-mark-light.png"
                    alt="Ledger"
                    width={32}
                    height={32}
                    className="h-[32px] w-[32px] object-contain"
                  />
                </CreditLink>
              </div>
            </div>

            <div className="flex flex-col items-center gap-4">
              <span className="font-sans text-[12px] font-medium uppercase tracking-[0.18em] text-wave-muted">
                Developed at
              </span>
              {/* Marks are tight-cropped variants (*-mark.png) — the source
                  squares carry ~25-35% dead black margin per side, which made
                  the ETHGlobal mark render ~30% smaller than ETHLisbon and
                  pushed the two visibly apart. */}
              <div className="flex items-center justify-center gap-5">
                <CreditLink
                  href="https://ethglobal.com/events/lisbon2026"
                  label="ETHGlobal Lisboa 2026"
                >
                  <Image
                    src="/ethlisbon-mark.png"
                    alt="ETHGlobal Lisboa 2026"
                    width={82}
                    height={133}
                    className="h-[40px] w-auto object-contain"
                  />
                </CreditLink>
                <CreditLink
                  href="https://ethglobal.com/events/ethonline2026"
                  label="ETHOnline 2026"
                >
                  <Image
                    src="/ethglobal-mark.png"
                    alt="ETHGlobal"
                    width={39}
                    height={70}
                    className="h-[40px] w-auto object-contain"
                  />
                </CreditLink>
              </div>
            </div>
          </div>
        </section>

        <section
          className="mx-auto flex w-full max-w-[440px] flex-col justify-center"
          aria-labelledby="signin-heading"
        >
          <div className="glass-panel rounded-[20px] p-6 sm:p-8">
            <div className="mb-6 flex flex-col items-center text-center md:hidden">
              <Image
                src="/wave-logo.png"
                alt=""
                width={64}
                height={64}
                className="animate-float h-16 w-16"
                aria-hidden="true"
              />
              <h1 className="mt-3 font-sans text-3xl font-extrabold tracking-tight text-wave-text">
                every pool makes a wave
              </h1>
              <p className="mt-2 text-pretty font-sans text-sm leading-relaxed text-wave-muted">
                Describe it in words. Ship it on-chain.
              </p>
            </div>

            <h2
              id="signin-heading"
              className="mb-1 font-sans text-2xl font-bold tracking-tight text-wave-text"
            >
              Ride in
            </h2>
            <p className="mb-6 font-sans text-sm leading-relaxed text-wave-muted">
              Ship on-chain strategies. The return is the signal.
            </p>

            <LandingSignIn />

            <p className="mt-5 font-sans text-[12px] leading-relaxed text-wave-muted">
              By continuing, you agree to the{' '}
              <Link
                href="/terms"
                className="font-medium text-wave-text underline-offset-2 hover:underline"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                className="font-medium text-wave-text underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </section>
      </div>

      <footer className="relative z-10 shrink-0 py-4 text-center">
        <p className="font-sans text-[13px] text-wave-muted">
          Powered by The Graph, 1inch and Ledger · 2026
        </p>
      </footer>
    </main>
  )
}
