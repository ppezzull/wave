import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingFrame } from '@/components/landing-frame'

export const metadata: Metadata = {
  title: 'Terms of Service · wave',
  description: 'The honest terms for an experimental protocol UI.',
}

const sections = [
  {
    h: 'Experimental software',
    p: 'wave is a hackathon build (ETHGlobal Lisboa 2026 → ETHOnline 2026) presented as-is, with no warranties of any kind. The SwapVM router, the strategy factory and this interface are unaudited. Use it to learn, not to guard money you cannot lose.',
  },
  {
    h: 'Strategies are immutable',
    p: 'Once shipped, a strategy is a standing on-chain program: its bytecode cannot be edited, only retired by draining its balances. You are the author of what you ship. The address that signs is the address that owns the pool. Verify the compiled spec before confirming any ship.',
  },
  {
    h: 'Approvals are yours',
    p: 'Shipping requires an explicit approval: a signature from your connected wallet or your Ledger device. Nothing ships without that gesture. What you sign is what ships; read the description hash before approving.',
  },
  {
    h: 'Testnet first',
    p: 'The deployment currently runs on Sepolia. Mainnet unlocks only after the Sepolia deployment is fully exercised. No service levels, no uptime promises, no reimbursement of gas or losses, on any network.',
  },
  {
    h: 'Your words, your pool',
    p: 'You are responsible for the strategies you describe and deploy, and for complying with the laws that apply to you wherever you are. wave does not custody funds, give financial advice, or offer trading returns.',
  },
]

export default function TermsPage() {
  return (
    <LandingFrame
      left={
        <Link
          href="/"
          className="font-sans text-[13px] text-wave-muted transition-colors hover:text-wave-text"
        >
          ← back to wave
        </Link>
      }
    >
      <div className="mx-auto w-full max-w-2xl px-5 pb-14 md:px-10">
        <div className="glass-panel rounded-[20px] p-6 sm:p-8">
          <h1 className="font-sans text-3xl font-extrabold tracking-tight text-wave-text">
            Terms of Service
          </h1>
          <p className="mt-2 font-sans text-[13px] text-wave-muted">
            Short and honest. This is a research build, and these terms say so.
          </p>
          <div className="mt-8 flex flex-col gap-6">
            {sections.map((s) => (
              <section key={s.h}>
                <h2 className="font-sans text-[17px] font-bold text-wave-text">{s.h}</h2>
                <p className="mt-1.5 font-sans text-[15px] leading-relaxed text-wave-muted">
                  {s.p}
                </p>
              </section>
            ))}
          </div>
          <p className="mt-10 font-sans text-[12px] text-wave-muted">
            Questions: open an issue on the{' '}
            <a
              href="https://github.com/ppezzull/wave"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-wave-text underline-offset-2 hover:underline"
            >
              wave repository
            </a>
            . · 2026
          </p>
        </div>
      </div>
    </LandingFrame>
  )
}
