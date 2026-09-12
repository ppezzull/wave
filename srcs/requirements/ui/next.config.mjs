/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server.js + minimal node_modules so the runtime
  // image doesn't need to COPY node_modules (smaller, faster, no pnpm at runtime).
  output: 'standalone',
  // Ledger DMK: the web-hid transport is ESM-only; the others ship dual builds
  // but transpiling them all is harmless belt-and-braces.
  transpilePackages: [
    '@ledgerhq/device-management-kit',
    '@ledgerhq/device-transport-kit-web-hid',
    '@ledgerhq/device-signer-kit-ethereum',
    '@ledgerhq/context-module',
  ],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      // /compose was removed — the agent chat (/chat) is the one create surface.
      // Old links (incl. ?fork=<id>, which /chat understands) keep working.
      { source: '/compose', destination: '/chat', permanent: false },
    ]
  },
}

export default nextConfig

