import type { Metadata } from 'next'
import Image from 'next/image'
import { PixelWaves } from '@/components/ui/pixel/animations/pixel-waves'
import { LandingSignIn } from '@/components/landing-sign-in'

export const metadata: Metadata = {
  title: 'Sign in — wave',
  description:
    'Ship on-chain trading strategies. Never miss the waves. If you have a pool, you might drown.',
}

export default function LandingPage() {
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
            never miss the wave
          </h1>
          <h2 className="mx-auto mt-4 max-w-md text-pretty text-center font-sans text-lg leading-relaxed text-wave-muted">
            If you have a pool, you might drown.
          </h2>

          {/* Credits */}
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col items-center gap-5">
            <div className="flex flex-col items-center gap-3">
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-wave-muted">
                Powered by
              </span>
              <div className="flex items-center justify-center gap-6">
                <Image
                  src="/1inch-1inch-logo-3869602491.png"
                  alt="1inch"
                  width={120}
                  height={26}
                  className="h-[22px] w-auto object-contain opacity-80 brightness-0 invert"
                />
                <Image
                  src="/thegraph-logo.svg"
                  alt="The Graph"
                  width={120}
                  height={26}
                  className="h-[22px] w-auto object-contain opacity-90"
                />
                <Image
                  src="/ethereum-name-service-ens-logo-1314521848.png"
                  alt="ENS"
                  width={100}
                  height={24}
                  className="h-[20px] w-auto object-contain"
                />
              </div>
            </div>

            <div className="flex flex-col items-center gap-3">
              <span className="font-sans text-[11px] font-medium uppercase tracking-[0.18em] text-wave-muted">
                Developed at
              </span>
              <Image
                src="/ethlisbon-logo.png"
                alt="ETHGlobal Lisboa 2026"
                width={140}
                height={34}
                className="h-[32px] w-auto object-contain"
              />
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
                never miss the wave
              </h1>
              <p className="mt-2 text-pretty font-sans text-sm leading-relaxed text-wave-muted">
                If you have a pool, you might drown.
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
              <span className="font-medium text-wave-text">Terms of Service</span>{' '}
              and{' '}
              <span className="font-medium text-wave-text">Privacy Policy</span>.
            </p>
          </div>
        </section>
      </div>

      <footer className="relative z-10 shrink-0 py-4 text-center">
        <p className="font-sans text-[13px] text-wave-muted">
          Powered by SwapVM — © Degensoft Ltd 2025 · wave · ETHGlobal Lisboa 2026
        </p>
      </footer>
    </main>
  )
}
