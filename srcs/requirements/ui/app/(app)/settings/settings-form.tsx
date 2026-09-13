'use client'

import { useRef, useState } from 'react'
import { Copy, Check, Camera } from 'lucide-react'
import { Footer } from '@/components/footer'
import { ConnectButton } from '@/components/connect-button'
import { useSessionUser } from '@/hooks/use-session-user'
import { identityFromAddress } from '@/lib/identity'
import type { CurrentUser } from '@/components/app-wrapper'
import { usePrivy } from '@privy-io/react-auth'
import { faucetDrip } from '@/app/actions/faucet'
import type { FaucetResult } from '@/app/actions/faucet'
import { LedgerTrustSection, type GateConfig } from '@/components/ledger/ledger-trust-section'
import { NetworkSelector } from '@/components/network-selector'
import { AuthorAvatar } from '@/components/generic-avatar'
import {
  ImageCropper,
  type FileWithPreview,
} from '@/components/image-cropper'
import { pinAvatarFile, publishAvatar } from '@/app/actions/avatar'
import { ipfsGatewayUrl, normalizeCid } from '@/lib/ipfs'
import type { NetworkOption } from '@/components/network-selector'
import type { NetworkId } from '@/lib/networks'

interface Props {
  user: CurrentUser
  network: { selected: NetworkId; options: NetworkOption[] }
  gate: GateConfig
}

// Form state (clipboard, avatar draft, saved toast) is the only client concern.
// The wallet comes from the Privy session when connected (real), else the server
// fallback (mock = alice; live stub = empty → renders the connect CTA).
export function SettingsForm({ user, network, gate }: Props) {
  const [copied, setCopied] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl ?? '')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [cropFile, setCropFile] = useState<FileWithPreview | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { sessionUser } = useSessionUser()
  const { logout } = usePrivy()

  const walletAddress = sessionUser?.address ?? user.walletAddress
  const identity = identityFromAddress(walletAddress)
  const truncated =
    walletAddress.length >= 10
      ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      : walletAddress || '-'

  const handleCopy = () => {
    if (!walletAddress) return
    navigator.clipboard.writeText(walletAddress).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleAvatarPick = () => {
    if (!walletAddress) return
    fileInputRef.current?.click()
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const withPreview = Object.assign(file, {
      preview: URL.createObjectURL(file),
    }) as FileWithPreview
    setCropFile(withPreview)
    setCropOpen(true)
    e.target.value = ''
  }

  const handleCroppedImage = (file: File) => {
    setAvatarFile(file)
    setCropFile(null)
  }

  const cidPreview = normalizeCid(avatarUrl)
  const previewUrl = avatarFile
    ? URL.createObjectURL(avatarFile)
    : cidPreview
      ? ipfsGatewayUrl(cidPreview)
      : avatarUrl

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!walletAddress || saving) return
    setSaving(true)
    setSaved(false)
    setSaveError('')
    try {
      let cid = normalizeCid(avatarUrl)
      if (avatarFile) {
        const fd = new FormData()
        fd.append('file', avatarFile)
        const pinned = await pinAvatarFile(fd)
        if (!pinned.ok || !pinned.cid) {
          setSaveError(pinned.reason ?? 'IPFS pin failed')
          return
        }
        cid = pinned.cid
        setAvatarUrl(`ipfs://${pinned.cid}`)
      }
      if (!cid) {
        setSaveError('Pin an image (needs PINATA_JWT) or paste an ipfs:// CID.')
        return
      }
      const published = await publishAvatar(walletAddress, cid)
      if (!published.ok) {
        setSaveError(published.reason ?? 'On-chain publish failed')
        return
      }
      setSaved(true)
      setAvatarFile(null)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
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
                      Sent {faucet.result.dripped ?? '0.05'} SEP. Receipt ↗
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
                  name="handle"
                  type="text"
                  value={sessionUser ? identity.handle : user.name}
                  readOnly
                  placeholder={walletAddress ? '' : 'connect a wallet'}
                  className="h-11 px-3 rounded-[10px] font-mono text-[14px] text-wave-muted bg-wave-surface cursor-default border border-wave-border"
                  aria-label="Identity handle (read only)"
                />
              </div>

              {/* Avatar — IPFS pin + Graph-indexed CID */}
              <div className="flex flex-col gap-2">
                <label
                  htmlFor="avatar-file"
                  className="font-sans text-[14px] text-wave-text font-medium"
                >
                  Avatar
                </label>
                <p className="font-sans text-[12px] text-wave-muted">
                  Image pins to IPFS. The Graph indexes the CID on-chain.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleAvatarPick}
                    disabled={!walletAddress}
                    className="group relative shrink-0 rounded-full disabled:opacity-60"
                    aria-label="Choose avatar image"
                  >
                    <AuthorAvatar url={previewUrl} size={56} />
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <Camera size={18} style={{ color: '#FFF3E0' }} aria-hidden="true" />
                    </span>
                  </button>
                  <input
                    ref={fileInputRef}
                    id="avatar-file"
                    name="avatarFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={handleFileSelect}
                    className="sr-only"
                    aria-label="Avatar image file"
                  />
                  <p className="font-sans text-[13px] text-wave-muted">
                    {avatarFile ? avatarFile.name : 'Tap the photo to crop a new one.'}
                  </p>
                </div>
                <ImageCropper
                  dialogOpen={cropOpen}
                  setDialogOpen={setCropOpen}
                  selectedFile={cropFile}
                  setSelectedFile={setCropFile}
                  onCroppedImage={handleCroppedImage}
                />
                <input
                  id="avatar-url"
                  name="avatarUrl"
                  type="text"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="ipfs://bafy… or Qm…"
                  className="h-11 px-3 rounded-[10px] font-mono text-[13px] text-wave-text bg-wave-surface outline-none focus:ring-2 focus:ring-wave-teal/40 transition-shadow placeholder:text-wave-muted/70 border border-wave-border"
                  aria-label="IPFS CID"
                />
              </div>

              <button
                type="submit"
                disabled={saving || !walletAddress}
                className="self-start px-6 py-2.5 rounded-[10px] font-sans text-[14px] font-semibold text-wave-text transition-all duration-150 hover:bg-wave-surface min-h-[44px] disabled:opacity-60"
                style={{ border: '1px solid #000000' }}
                aria-label="Save identity settings"
              >
                {saving ? 'Publishing…' : saved ? 'Published' : 'Save'}
              </button>
              {saveError && (
                <p className="font-sans text-[13px]" style={{ color: '#E5484D' }}>
                  {saveError}
                </p>
              )}
            </form>

            {/* Ledger trust — hardware approval status + pairing */}
            <div className="h-px bg-wave-border my-6" aria-hidden="true" />
            <LedgerTrustSection gate={gate} />

            {/* Network — which chain the app reads; ships follow the agent */}
            <div className="h-px bg-wave-border my-6" aria-hidden="true" />
            <h2 className="font-sans font-semibold text-[1rem] text-wave-text mb-1">
              Network
            </h2>
            <p className="font-sans text-[13px] text-wave-muted mb-4">
              Where this app reads strategies from.
            </p>
            <NetworkSelector selected={network.selected} options={network.options} />

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
