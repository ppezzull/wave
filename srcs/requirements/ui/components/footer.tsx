interface FooterProps {
  dark?: boolean
}

export function Footer({ dark = false }: FooterProps) {
  return (
    <footer
      className={`py-2 border-t ${
        dark ? 'bg-wave-inverted border-white/10' : 'bg-transparent border-wave-border'
      }`}
    >
      <p
        className="text-center font-sans text-[11px] leading-tight"
        style={{ color: dark ? 'rgba(255,255,255,0.4)' : '#5B6B72' }}
      >
        Powered by The Graph, 1inch and Ledger &middot; 2026
      </p>
      <p className="mt-0.5 text-center font-sans text-[11px] leading-tight">
        <a
          href="/terms"
          className={dark ? 'text-white/50 hover:text-white/80' : 'text-wave-muted hover:text-wave-text'}
        >
          Terms of Service
        </a>
        <span className="mx-2 text-wave-muted" aria-hidden="true">
          ·
        </span>
        <a
          href="/privacy"
          className={dark ? 'text-white/50 hover:text-white/80' : 'text-wave-muted hover:text-wave-text'}
        >
          Privacy Policy
        </a>
      </p>
    </footer>
  )
}
