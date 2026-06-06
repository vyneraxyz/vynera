import type { NextConfig } from "next";

const CSP = [
  "default-src 'self'",
  // 'unsafe-inline' required: Next.js inline scripts + theme-init Script
  // 'wasm-unsafe-eval' required: @polkadot/wasm-crypto
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // next/font self-hosts Google Fonts at build time — no external font origin needed
  "font-src 'self'",
  "img-src 'self' data: blob:",
  [
    "connect-src 'self'",
    "wss://rpc.mainnet.autonomys.xyz",
    "wss://auto-evm.mainnet.autonomys.xyz",
    "https://auto-evm.mainnet.autonomys.xyz",
  ].join(" "),
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: CSP },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
