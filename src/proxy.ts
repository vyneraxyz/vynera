import { NextResponse, type NextRequest } from "next/server";
import { CHAINS } from "@/lib/constants";

// Per-request nonce CSP: only scripts Next.js tags with the nonce may run, so an
// injected <script> (XSS, compromised dependency markup) is refused by the browser.
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const { consensus, evm } = CHAINS.Mainnet;

  const csp = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' required: @polkadot/wasm-crypto
    // 'unsafe-eval' in dev only: React reconstructs server error stacks with eval
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline' kept for style attributes (React `style` props, framer-motion);
    // styles can't execute code, scripts are the part that matters
    "style-src 'self' 'unsafe-inline'",
    // next/font self-hosts Google Fonts at build time — no external font origin needed
    "font-src 'self'",
    "img-src 'self' data: blob:",
    ["connect-src 'self'", new URL(consensus.rpc).origin, new URL(evm.rpc).origin, new URL(evm.httpRpc).origin].join(" "),
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from this request header and stamps it on its scripts
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|ico|webp|jpg)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
