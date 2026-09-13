import { User } from 'lucide-react'

/** Photo when The Graph has an IPFS CID; otherwise the generic person mark. */
export function AuthorAvatar({
  url,
  size = 40,
  className = '',
}: {
  url?: string
  size?: number
  className?: string
}) {
  if (url) {
    return (
      <span
        className={`inline-flex shrink-0 overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="h-full w-full object-cover" />
      </span>
    )
  }
  return <GenericAvatar size={size} className={className} />
}

/** Empty-state avatar: teal-to-navy disc with a generic person mark. */
export function GenericAvatar({
  size = 40,
  className = '',
}: {
  size?: number
  className?: string
}) {
  const glyph = Math.max(12, Math.round(size * 0.44))
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #2A9D8F, #0F3460)',
      }}
      aria-hidden="true"
    >
      <User size={glyph} strokeWidth={1.75} style={{ color: '#FFF3E0' }} />
    </span>
  )
}
