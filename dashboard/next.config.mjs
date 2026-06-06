/** @type {import('next').NextConfig} */
const nextConfig = {
  // 'standalone' menghasilkan server.js mandiri tanpa perlu node_modules penuh
  // dibutuhkan untuk deployment di VPS via systemd service
  output: "standalone",

  env: {
    NEXT_PUBLIC_BACKEND_URL: process.env.NEXT_PUBLIC_BACKEND_URL || "https://umkm-backend.aimarketingstrategic.com",
  },
};

export default nextConfig;
