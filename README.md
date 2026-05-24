# Vynera

> Focused UI for XDM transfers between Autonomys Consensus chain and Auto EVM domain.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built with Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![Powered by Autonomys SDK](https://img.shields.io/badge/SDK-%40autonomys%2Fauto--xdm-blueviolet)](https://github.com/autonomys/auto-sdk)

[Live](https://vynera.xyz) · [Report bug](../../issues)

---

## Features

- **Consensus → Auto EVM** — send AI3 to a `0x…` EVM address on the Auto EVM domain
- **Auto EVM → Consensus** — return AI3 to an SS58 address on the Consensus chain
- Live transaction status: Signing → Broadcast → InBlock → Finalized → Challenge period → Relayed → Executed
- Challenge period block counter with WebSocket subscription and time-based fallback
- Balance display with MAX button (reserves 0.1 AI3 to cover fees)
- Transaction history persisted to `localStorage`
- Active transaction survives page reload — status tracking resumes automatically
- Mainnet / Taurus testnet toggle
- Light and dark themes, persisted across reloads

**Supported wallets**

| Side | Wallets |
|------|---------|
| Consensus (Substrate) | SubWallet, Talisman, polkadot{.js} |
| Auto EVM | MetaMask, Rabby, any EIP-1193 wallet |

---

## Fees

| Direction | Platform fee | Network fee | Minimum amount |
|-----------|-------------|-------------|----------------|
| Consensus → Auto EVM | 3% (collected via `utility.batchAll`) | ~0.001 AI3 | 1 AI3 |
| Auto EVM → Consensus | free | ~0.001 AI3 | 1 AI3 |

The minimum transfer amount is enforced by the Autonomys Transporter pallet on-chain.

---

## Local development

**Prerequisites:** Node.js 22.x, a browser wallet extension

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Deploy

Standard Next.js SSR app. Recommended target: **Vercel** — push to GitHub and import the repo in the Vercel dashboard. No environment variables required.

```bash
npm run build   # local production build
npm start       # serve production build locally
```

---

## Chains

| Network | Chain | RPC |
|---------|-------|-----|
| Mainnet | Consensus | `wss://rpc.mainnet.autonomys.xyz/ws` |
| Mainnet | Auto EVM | `wss://auto-evm.mainnet.autonomys.xyz/ws` |
| Taurus testnet | Consensus | `wss://rpc.taurus.autonomys.xyz/ws` |
| Taurus testnet | Auto EVM | `wss://auto-evm.taurus.autonomys.xyz/ws` |

---

## Tech stack

| Layer | Library |
|-------|---------|
| Framework | Next.js 16 (App Router) |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion |
| State | Zustand 5 |
| Chain API | `@autonomys/auto-utils` |
| XDM extrinsic | `@autonomys/auto-xdm` |
| Substrate wallet | `@polkadot/extension-dapp` |
| Address utils | `@polkadot/util-crypto` |
| Icons | lucide-react |

All token amounts are handled as `BigInt` (Shannons, 10¹⁸ per AI3). No floating-point math.

---

## Project structure

```
src/
  app/              Next.js App Router root (layout, page, globals.css)
  components/
    bridge/         DirectionToggle, SenderBlock, RecipientInput,
                    AmountInput, SummaryCard, ReviewDialog, StatusTimeline
    wallet/         WalletProvider, WalletConnect, useWalletActions
  lib/
    autonomys/      addresses.ts, amounts.ts, api.ts, xdm.ts
    evm/            wallet.ts  (EVM provider helpers)
    constants.ts    Chain configs, fee constants, block timing
  store/
    wallet.ts       Connected account, balance, network, theme
    transactions.ts Active tx state + history, persisted to localStorage
  types/
    index.ts        Direction, TxPhase, StoredTx, WalletAccount, …
```

---

## Contributing

Issues and pull requests are welcome. A few conventions:

- No `any` — use `unknown` with type narrowing
- All amount math stays in BigInt — no `Number()` or `parseFloat` on Shannons
- Browser-only polkadot modules (`@polkadot/extension-dapp`, etc.) must be loaded via `await import()` inside functions, not as static top-level imports

---

## License

MIT
