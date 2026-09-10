'use client'

import { useEffect, useState } from 'react'
import { Copy, Check, BadgeCheck } from 'lucide-react'
import { Footer } from '@/components/footer'
import { ConnectButton } from '@/components/connect-button'
import { useSessionUser } from '@/hooks/use-session-user'
import { identityFromAddress } from '@/lib/identity'
import type { CurrentUser } from '@/components/app-wrapper'
import { usePrivy } from '@privy-io/react-auth'
import { faucetDrip } from '@/app/actions/faucet'
import type { FaucetResult } from '@/app/actions/faucet'
import { getWorldTrustPanel } from '@/app/actions/identity'

interface Props {
  user: CurrentUser
}

// Form state (clipboard, avatar draft, saved toast) is the only client concern.
// The wallet comes from the Privy session when connected (real), else the server
// fallback (mock = alice; live stub = empty → renders the connect CTA).
export function SettingsForm({ user }: Props) {
  const [copied, setCopied] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '')
  const [saved, setSaved] = useState(false)
  const { sessionUser } = useSessionUser()
  const { logout } = usePrivy()

  const walletAddress = sessionUser?.address ?? user.walletAddress
  const identity = identityFromAddress(walletAddress)
  const truncated =
    walletAddress.length >= 10
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress || '—'

  const handleCopy = () => {
    if (!walletAddress) return
    navigator.clipboard.writeText(walletAddress).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // Testnet faucet (the agent's capped buffer wallet). The server action never throws,
  // so the catch is belt-and-braces; a failed drip just shows the agent's reason line.
  const [faucet, setFaucet] = useState<{
    status: 'idle' | 'pending' | 'sent' | 'error'
    result?: FaucetResult
  }>({ status: 'idle' })

  const handleFaucet = async () => {
    if (!walletAddress || faucet.status === 'pending') return
    setFaucet({ status: 'pending' })
    try {
      const result = await faucetDrip(walletAddress)
      setFaucet(result.ok ? { status: 'sent', result } : { status: 'error', result })
    } catch (err) {
      setFaucet({ status: 'error', result: { ok: false, reason: String(err).slice(0, 200) } })
    }
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
              {walletAddress ? (
                <div className="flex items-center gap-3">
                  <span
                    className="font-mono text-[14px] text-wave-text"
                    aria-label={`Wallet address: ${walletAddress}`}
                  >
                    {truncated}
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
              ) : (
                <div className="max-w-[240px]">
                  <ConnectButton />
                </div>
              )}
              <p className="font-sans text-[13px] text-wave-muted">
                {walletAddress ? 'Connected via Privy' : 'No wallet connected'}
              </p>

              {/* Testnet faucet — drips Sepolia ETH from the agent's buffer wallet
                  (0.05/drip, 6h cooldown, empty wallets only). */}
              {walletAddress && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleFaucet}
                    className="self-start px-6 py-2.5 rounded-[10px] font-sans text-[14px] font-semibold text-wave-text transition-all duration-150 hover:bg-wave-surface min-h-[44px] disabled:opacity-60"
                    style={{ border: '1px solid #000000' }}
                    aria-label="Get test ETH from the wave faucet"
                    disabled={faucet.status === 'pending'}
                  >
                    {faucet.status === 'pending'
                      ? 'Dripping…'
                      : faucet.status === 'sent'
                        ? 'Sent ✓'
                        : 'Get test ETH'}
                  </button>
                  {faucet.status === 'sent' && faucet.result?.txHash && (
                    <a
                      href={`https://sepolia.etherscan.io/tx/${faucet.result.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-sans text-[13px]"
                      style={{ color: '#1F9D6B' }}
                    >
                      Sent {faucet.result.dripped ?? '0.05'} SEP — receipt ↗
                    </a>
                  )}
                  {faucet.status === 'error' && faucet.result?.reason && (
                    <p className="font-sans text-[13px]" style={{ color: '#E5484D' }}>
                      {faucet.result.reason}
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* World trust panel — the AgentBook side of the trust ladder (plan
              Fase 1): your wallet + the wave agent wallets, human-backed or not. */}
          <WorldTrustSection youVerified={!!sessionUser?.verifiedHuman} />

          {/* Identity section */}
          <section aria-labelledby="identity-heading">
            <h2
              id="identity-heading"
              className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
            >
              Identity
            </h2>
            <div className="h-px bg-wave-border mb-5" aria-hidden="true" />

            <form onSubmit={handleSave} className="flex flex-col gap-5" noValidate>
              {/* Handle (read-only, from the identity seam) */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="identity-handle"
                  className="font-sans text-[14px] text-wave-text font-medium"
                >
                  Handle
                </label>
                <input
                  id="identity-handle"
                  type="text"
                  value={sessionUser ? identity.handle : user.name}
                  readOnly
                  placeholder={walletAddress ? '' : 'connect a wallet'}
                  className="h-11 px-3 rounded-[10px] font-mono text-[14px] text-wave-muted bg-wave-surface cursor-default border border-wave-border"
                  aria-label="Identity handle (read only)"
                />
                <p className="font-sans text-[13px] text-wave-muted">
                  {/* World "verified human" — renders nothing until AgentKit
                      flips verifiedHuman (the client-visible World distinction). */}
                  {sessionUser?.verifiedHuman && 'Verified human (World ID)'}
                </p>
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
                aria-label="Save identity settings"
              >
                {saved ? 'Saved' : 'Save'}
              </button>
            </form>

            {/* Divider + Sign Out */}
            <div className="h-px bg-wave-border my-6" aria-hidden="true" />
            <button
              type="button"
              onClick={() => void logout()}
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

// World trust panel — statuses come from the server-only AgentBook resolver
// (app/actions/identity.ts). Never fabricated: unknown = "not in AgentBook".
function WorldTrustSection({ youVerified }: { youVerified: boolean }) {
  const [panel, setPanel] = useState<Awaited<ReturnType<typeof getWorldTrustPanel>> | null>(null)

  useEffect(() => {
    let live = true
    getWorldTrustPanel()
      .then((p) => {
        if (live) setPanel(p)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const short = (addr: string) =>
    addr.length >= 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr

  return (
    <section aria-labelledby="world-heading">
      <h2
        id="world-heading"
        className="font-sans font-semibold text-[1rem] text-wave-text mb-3"
      >
        World trust
      </h2>
      <div className="h-px bg-wave-border mb-5" aria-hidden="true" />

      <div className="flex flex-col gap-2">
        {/* Your wallet */}
        <div className="flex items-center justify-between gap-3 rounded-[10px] border border-wave-border bg-wave-surface px-3 py-2.5">
          <span className="font-sans text-[14px] text-wave-text">Your wallet — human-backed</span>
          {youVerified ? (
            <span className="flex items-center gap-1 font-sans text-[13px]" style={{ color: '#2A9D8F' }}>
              <BadgeCheck size={14} aria-label="Verified human" /> verified human
            </span>
          ) : (
            <span className="font-sans text-[13px] text-wave-muted">not verified</span>
          )}
        </div>

        {/* wave agent wallets (statuses load async) */}
        {panel?.agents.map((a) => (
          <div
            key={a.role}
            className="flex items-center justify-between gap-3 rounded-[10px] border border-wave-border bg-wave-surface px-3 py-2.5"
          >
            <span className="font-mono text-[13px] text-wave-muted truncate">
              {a.role} agent · {short(a.address)}
            </span>
            {a.verifiedHuman ? (
              <span className="flex items-center gap-1 font-sans text-[13px]" style={{ color: '#2A9D8F' }}>
                <BadgeCheck size={14} aria-label="Human-backed agent" /> AgentBook
              </span>
            ) : (
              <span className="font-sans text-[13px] text-wave-muted">not in AgentBook</span>
            )}
          </div>
        ))}
        {!panel && (
          <div className="rounded-[10px] border border-wave-border bg-wave-surface px-3 py-2.5">
            <span className="font-sans text-[13px] text-wave-muted">resolving agent wallets…</span>
          </div>
        )}

        {panel?.devFixtures && (
          <p className="font-sans text-[12px] text-wave-muted">
            dev fixtures active (WORLD_AGENTBOOK_DEV_ALLOW) — AgentBook registration
            via agentkit-cli pending
          </p>
        )}
      </div>
    </section>
  )
}
