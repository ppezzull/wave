'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'
import { Footer } from '@/components/footer'
import { currentUser } from '@/lib/mock-data'

const WALLET_ADDRESS = currentUser.walletAddress
const TRUNCATED = `${WALLET_ADDRESS.slice(0, 6)}...${WALLET_ADDRESS.slice(-4)}`

export default function SettingsPage() {
  const [copied, setCopied] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatarUrl ?? '')
  const [saved, setSaved] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(WALLET_ADDRESS).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <>
      {/* Page header */}
      <header className="sticky top-12 md:top-0 z-30 bg-wave-bg/85 backdrop-blur-md border-b border-wave-border px-4 py-2.5">
        <h1 className="font-sans font-bold text-[1.25rem] text-wave-text">
          Settings
        </h1>
      </header>

      <div className="flex-1 px-4 py-6">
        <div className="w-full flex flex-col gap-8">

          {/* Wallet section */}
          <section aria-labelledby="wallet-heading">
            <h2
              id="wallet-heading"
              className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
            >
              Wallet
            </h2>
            <div className="h-px bg-wave-border mb-5" aria-hidden="true" />

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <span
                  className="font-mono text-[14px] text-wave-text"
                  aria-label={`Wallet address: ${WALLET_ADDRESS}`}
                >
                  {TRUNCATED}
                </span>
                <button
                  onClick={handleCopy}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-wave-muted hover:text-wave-text transition-colors"
                  aria-label="Copy wallet address"
                >
                  {copied ? (
                    <Check size={15} style={{ color: '#1F9D6B' }} aria-hidden="true" />
                  ) : (
                    <Copy size={15} aria-hidden="true" />
                  )}
                </button>
              </div>
              <p className="font-sans text-[13px] text-wave-muted">
                Connected via Privy
              </p>
            </div>
          </section>

          {/* ENS Identity section */}
          <section aria-labelledby="ens-heading">
            <h2
              id="ens-heading"
              className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
            >
              ENS Identity
            </h2>
            <div className="h-px bg-wave-border mb-5" aria-hidden="true" />

            <form onSubmit={handleSave} className="flex flex-col gap-5" noValidate>
              {/* ENS Name (read-only) */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="ens-name"
                  className="font-sans text-[14px] text-wave-text font-medium"
                >
                  ENS Name
                </label>
                <input
                  id="ens-name"
                  type="text"
                  value={currentUser.name}
                  readOnly
                  className="h-11 px-3 rounded-[10px] font-mono text-[14px] text-wave-muted bg-wave-surface cursor-default border border-wave-border"
                  aria-label="ENS name (read only)"
                />
              </div>

              {/* Avatar URL */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="avatar-url"
                  className="font-sans text-[14px] text-wave-text font-medium"
                >
                  Avatar URL
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="avatar-url"
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 h-11 px-3 rounded-[10px] font-sans text-[14px] text-wave-text bg-wave-surface outline-none focus:ring-2 focus:ring-wave-teal/40 transition-shadow placeholder:text-wave-muted/70 border border-wave-border"
                    aria-label="Avatar URL"
                  />
                  {/* Avatar preview */}
                  <div
                    className="w-11 h-11 rounded-full shrink-0 overflow-hidden border border-wave-border"
                    aria-hidden="true"
                  >
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="Avatar preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full"
                        style={{
                          background:
                            'linear-gradient(135deg, #2A9D8F, #0F3460)',
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Save button */}
              <button
                type="submit"
                className="self-start px-6 py-2.5 rounded-[10px] font-sans text-[14px] font-semibold text-wave-text transition-all duration-150 hover:bg-wave-surface min-h-[44px]"
                style={{ border: '1px solid #000000' }}
                aria-label="Save ENS identity settings"
              >
                {saved ? 'Saved' : 'Save'}
              </button>
            </form>

            {/* Divider + Sign Out */}
            <div className="h-px bg-wave-border my-6" aria-hidden="true" />
            <button
              type="button"
              className="font-sans text-[14px] font-semibold min-h-[44px] transition-colors hover:opacity-80"
              style={{ color: '#E5484D' }}
              aria-label="Sign out of wave"
            >
              Sign Out
            </button>
          </section>
        </div>
      </div>

      <Footer />
    </>
  )
}
