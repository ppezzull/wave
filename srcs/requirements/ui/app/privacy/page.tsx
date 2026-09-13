import type { Metadata } from 'next'
import Link from 'next/link'
import { LandingFrame } from '@/components/landing-frame'

export const metadata: Metadata = {
  title: 'Privacy Policy · wave',
  description: 'What wave stores, what it never touches.',
}

const sections = [
  {
    h: 'Wallet address, not identity',
    p: 'Sign-in is handled by Privy. We receive your wallet address, nothing else. No email is required, no profile is fabricated: your address is your handle, and an ENS name shows only if your address itself declares one.',
  },
  {
    h: 'On-chain is public by design',
    p: 'Strategies, authorship, fills and swap history live on-chain and are indexed by The Graph. That data is public by nature. Anyone can read it, including this UI. Nothing you ship is private.',
  },
  {
    h: 'Chats stay in your browser',
    p: 'Conversation threads with the agent are persisted in your browser’s local storage, on your device. They are sent to the agent only while composing, to compile a strategy from your description, and are not stored server-side. Finished conversations are archived locally (never uploaded) and you can export or import them as a JSON file from the Chats page. The file is yours to keep, move, or delete.',
  },
  {
    h: 'On-chain backups are ciphertext',
    p: 'You can back the archive up on-chain (Sepolia). Before anything is sent, your wallet signs one message and the signature, inside your browser, derives an AES-256-GCM key. Only the encrypted archive is stored on-chain: anyone can see the blob, nobody can read it without your wallet’s signature. The key and the plaintext never leave your device.',
  },
  {
    h: 'No trackers',
    p: 'No analytics, no advertising pixels, no fingerprinting, no third-party trackers. The server keeps standard request logs for debugging and nothing else. We do not sell, share, or transfer any personal data. There is very little to sell.',
  },
  {
    h: 'Deleting',
    p: 'Clearing site data in your browser removes your local threads. On-chain records (your strategies and their authorship) cannot be deleted by anyone. That is what immutable means.',
  },
]

export default function PrivacyPage() {
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
            Privacy Policy
          </h1>
          <p className="mt-2 font-sans text-[13px] text-wave-muted">
            Short and honest: a wallet address in, public chains out.
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
