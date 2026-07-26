interface FooterProps {
  dark?: boolean
}

export function Footer({ dark = false }: FooterProps) {
  return (
    <footer
      className={`py-6 border-t ${
        dark
          ? 'bg-wave-inverted border-white/10'
          : 'bg-wave-bg border-wave-border'
      }`}
    >
      <p
        className="text-center font-sans text-[13px]"
        style={{ color: dark ? 'rgba(255,255,255,0.4)' : '#5B6B72' }}
      >
        Powered by SwapVM &middot; Flavio, Pietro &amp; Flaviano &middot; 2026
      </p>
    </footer>
  )
}
