import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { PixelWaves } from '@/components/ui/pixel/animations/pixel-waves'

export const metadata: Metadata = {
  title: 'Sign in — wave',
  description:
    'Ship on-chain trading strategies. Never miss the waves. If you have a pool, you might drown.',
}

const LISBOA =
  'linear-gradient(135deg, #0F3460 0%, #2A9D8F 45%, #26A69A 70%, #FFF3E0 100%)'

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <path d="M16 12h.01" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <main className="relative flex h-dvh w-full flex-col overflow-y-auto overflow-x-hidden bg-wave-bg md:overflow-hidden">
      {/* Ambient pixel-wave field. Fixed behind everything, tinted with the
          Lisboa sea palette — large, colorful pixels so the ocean texture
          reads clearly behind the login card. */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <PixelWaves
          className="h-full w-full"
          colors={['#0F3460', '#2A9D8F', '#26A69A', '#FFF3E0']}
          pixelSize={16}
          gap={2}
          speed={0.8}
          opacity={0.9}
        />
        {/* Soft wash on the login side so the card stays legible */}
        <div className="absolute inset-0 bg-gradient-to-r from-wave-bg via-wave-bg/70 to-transparent md:via-wave-bg/40" />
      </div>

      {/* Top bar */}
      <header className="relative z-20 flex h-16 shrink-0 items-center px-5 md:px-10">
        <div className="flex items-center gap-2.5">
          <Image
            src="/wave-logo.png"
            alt="wave logo"
            width={36}
            height={36}
            className="h-9 w-9"
            priority
          />
          <span className="font-sans text-xl font-extrabold tracking-tight text-wave-text">
            wave
          </span>
        </div>
      </header>

      {/* Split hero */}
      <div className="relative z-10 grid flex-1 grid-cols-1 items-center gap-8 px-5 pb-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:gap-6 md:px-10">
        {/* Left: identity + tagline (hidden as decorative on small screens where
            the login card leads) */}
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
            likes are liquidity
          </h1>
          <p className="mx-auto mt-4 max-w-md text-pretty text-center font-sans text-lg leading-relaxed text-wave-muted">
            Never miss the waves. If you have a pool, you might drown.
          </p>
        </section>

        {/* Right: glass login card */}
        <section
          className="mx-auto flex w-full max-w-[440px] flex-col justify-center"
          aria-labelledby="signin-heading"
        >
          <div className="glass-panel rounded-[20px] p-6 sm:p-8">
            {/* Mobile-only compact identity */}
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
                likes are liquidity
              </h1>
              <p className="mt-2 text-pretty font-sans text-sm leading-relaxed text-wave-muted">
                Never miss the waves. If you have a pool, you might drown.
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

            {/* Primary: wallet (the one gradient moment) */}
            <Link
              href="/explore"
              className="flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-white transition-all duration-[220ms] hover:brightness-[1.05] hover:scale-[1.01] active:scale-[0.99]"
              style={{ background: LISBOA }}
            >
              <WalletIcon />
              Sign in with wallet
            </Link>

            {/* Secondary providers */}
            <div className="mt-3 flex flex-col gap-3">
              <Link
                href="/explore"
                className="glass-btn flex min-h-[48px] w-full items-center justify-center gap-2.5 rounded-[10px] font-sans text-[15px] font-semibold text-wave-text"
              >
                <GoogleIcon />
                Continue with Google
              </Link>
            </div>

            {/* Divider */}
            <div className="my-5 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-wave-border" />
              <span className="font-sans text-[13px] text-wave-muted">or</span>
              <span className="h-px flex-1 bg-wave-border" />
            </div>

            {/* Email */}
            <form action="/explore" className="flex flex-col gap-3">
              <label htmlFor="email" className="sr-only">
                Email or ENS name
              </label>
              <input
                id="email"
                name="email"
                type="text"
                placeholder="email or yourname.eth"
                className="glass-input min-h-[48px] w-full rounded-[10px] px-4 font-sans text-[15px] text-wave-text placeholder:text-wave-muted/70"
              />
              <button
                type="submit"
                className="min-h-[48px] w-full rounded-[10px] bg-wave-inverted font-sans text-[15px] font-semibold text-black transition-all duration-150 hover:opacity-90 active:scale-[0.99]"
              >
                Continue
              </button>
            </form>

            <p className="mt-5 font-sans text-[12px] leading-relaxed text-wave-muted">
              By continuing, you agree to the{' '}
              <span className="font-medium text-wave-text">Terms of Service</span>{' '}
              and{' '}
              <span className="font-medium text-wave-text">Privacy Policy</span>.
            </p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="relative z-10 shrink-0 py-4 text-center">
        <p className="font-sans text-[13px] text-wave-muted">
          Powered by SwapVM &middot; Flavio, Pietro &amp; Flaviano &middot; 2026
        </p>
      </footer>
    </main>
  )
}
