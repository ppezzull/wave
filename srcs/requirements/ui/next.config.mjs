/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server.js + minimal node_modules so the runtime
  // image doesn't need to COPY node_modules (smaller, faster, no pnpm at runtime).
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig

