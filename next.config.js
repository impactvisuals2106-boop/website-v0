/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: [],
  },
  // Ensure proper routing for Vercel
  output: 'standalone',
}

module.exports = nextConfig

