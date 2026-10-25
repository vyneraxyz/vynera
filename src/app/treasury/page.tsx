"use client";

import { ArrowLeft, ExternalLink, KeyRound, Lock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Spinner } from "@/components/bridge/StatusTimeline";
import { useWalletActions } from "@/components/wallet/useWalletActions";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { samePublicKey, toAutonomysAddress, truncateAddress } from "@/lib/autonomys/addresses";
import { formatAI3 } from "@/lib/autonomys/amounts";
import { CHAINS, TREASURY_SS58 } from "@/lib/constants";
import { formatUsd, useAi3Price } from "@/lib/price";
import { buildChallenge } from "@/lib/treasuryAuth";
import { useWalletStore } from "@/store/wallet";

interface WindowStats {
  count: number;
  fees: string;
  referralPaid: string;
  volume: string;
  users: number;
}

interface TreasuryData {
  balance: string;
  history: null | {
    scanned: number;
    oldest: number | null;
    windows: Record<"day" | "week" | "month" | "all", WindowStats>;
    daily: { day: string; fees: string; count: number }[];
    recent: { extrinsic: string; at: number; sender: string; volume: string; treasury: string; referral: string }[];
  };
}

const WINDOWS = [
  { id: "day", label: "24 h" },
  { id: "week", label: "7 days" },
  { id: "month", label: "30 days" },
  { id: "all", label: "All loaded" },
] as const;

export default function TreasuryPage() {
  return (
    <WalletProvider>
      <Treasury />
    </WalletProvider>
  );
}

function Treasury() {
  const { connected, selectedAddress } = useWalletStore();
  const { loadAccountsFromExtension } = useWalletActions();
  const [data, setData] = useState<TreasuryData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isTreasury = !!selectedAddress && samePublicKey(selectedAddress, TREASURY_SS58);

  const unlock = async () => {
    if (!selectedAddress) return;
    setLoading(true);
    setError(null);
    try {
      const [{ web3FromAddress }, { stringToHex }] = await Promise.all([
        import("@polkadot/extension-dapp"),
        import("@polkadot/util"),
      ]);
      const injector = await web3FromAddress(selectedAddress);
      if (!injector.signer.signRaw) throw new Error("This wallet can't sign messages");
      const message = buildChallenge(window.location.host);
      const { signature } = await injector.signer.signRaw({ address: selectedAddress, data: stringToHex(message), type: "bytes" });
      const res = await fetch("/api/treasury", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const body = (await res.json()) as TreasuryData & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setData(body);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to unlock";
      setError(/cancel|reject/i.test(msg) ? "Signature cancelled" : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-14 relative z-10">
      <div className="mesh-bg" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="w-full max-w-[720px]">
        <header className="flex items-center justify-between gap-3 mb-5 px-1">
          <div className="flex items-center gap-3">
            <Link href="/" className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center" aria-label="Back to bridge">
              <ArrowLeft size={15} />
            </Link>
            <div>
              <h1 className="text-c1 text-base font-semibold tracking-tight">Treasury</h1>
              <p className="text-c3 text-[11.5px] font-mono">{truncateAddress(TREASURY_SS58, 8, 6)}</p>
            </div>
          </div>
          <WalletConnect />
        </header>

        {!data && (
          <main className="surface rounded-3xl p-6 text-center">
            <div className="w-12 h-12 rounded-full surface-2 flex items-center justify-center mx-auto mb-3">
              <Lock size={20} className="text-c2" aria-hidden="true" />
            </div>
            {!connected ? (
              <>
                <p className="text-c1 font-medium">Connect the treasury wallet</p>
                <p className="text-c2 text-sm mt-1">Only the treasury account can open this dashboard.</p>
                <button type="button" onClick={() => loadAccountsFromExtension(true)} className="btn-accent rounded-xl px-5 py-3 mt-4 text-sm text-white">
                  Connect wallet
                </button>
              </>
            ) : !isTreasury ? (
              <>
                <p className="text-c1 font-medium">This account is not the treasury</p>
                <p className="text-c2 text-sm mt-1">
                  Select {truncateAddress(TREASURY_SS58, 6, 4)} in the wallet menu above.
                </p>
              </>
            ) : (
              <>
                <p className="text-c1 font-medium">Sign to unlock</p>
                <p className="text-c2 text-sm mt-1 max-w-[380px] mx-auto">
                  Your wallet will ask you to sign a message. It proves you control the treasury and does not authorize any transaction.
                </p>
                <button
                  type="button"
                  onClick={unlock}
                  disabled={loading}
                  className="btn-accent rounded-xl px-5 py-3 mt-4 text-sm text-white inline-flex items-center gap-2"
                >
                  {loading ? <Spinner size={14} /> : <KeyRound size={14} aria-hidden="true" />} Unlock dashboard
                </button>
              </>
            )}
            {error && (
              <p className="text-sm text-c1 mt-3" role="alert">
                {error}
              </p>
            )}
          </main>
        )}

        {data && <Dashboard data={data} />}
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: TreasuryData }) {
  const usd = useAi3Price();
  const [win, setWin] = useState<(typeof WINDOWS)[number]["id"]>("month");
  const h = data.history;
  const s = h?.windows[win];
  const usdOf = (v: string) => formatUsd(BigInt(v), usd);

  return (
    <main className="grid gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Treasury balance" value={`${formatAI3(BigInt(data.balance), 2)} AI3`} sub={usdOf(data.balance)} />
        <Tile label="Fees earned" value={s ? `${formatAI3(BigInt(s.fees), 2)} AI3` : "—"} sub={s ? usdOf(s.fees) : null} />
        <Tile label="Volume bridged" value={s ? `${formatAI3(BigInt(s.volume), 0)} AI3` : "—"} sub={s ? `${s.count} transfers` : null} />
        <Tile label="Users" value={s ? String(s.users) : "—"} sub={s ? `${formatAI3(BigInt(s.referralPaid), 2)} AI3 to referrers` : null} />
      </div>

      {!h ? (
        <div className="surface rounded-2xl p-4 text-sm text-c2">
          Fee history needs a Subscan API key. Add <code className="font-mono text-c1">SUBSCAN_API_KEY</code> in Vercel → Project → Settings →
          Environment Variables, then redeploy. The balance above is live from the chain.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5" role="tablist" aria-label="Time range">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                role="tab"
                aria-selected={win === w.id}
                onClick={() => setWin(w.id)}
                className={`rounded-full px-3 py-1.5 text-[12px] ${win === w.id ? "btn-accent text-white" : "btn-ghost text-c2"}`}
              >
                {w.label}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-c3">
              {h.scanned} deposits scanned{h.oldest ? ` · since ${new Date(h.oldest).toLocaleDateString("en", { dateStyle: "medium" })}` : ""}
            </span>
          </div>

          <FeeChart daily={h.daily} />

          <div className="surface rounded-2xl overflow-hidden">
            <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wider text-c3">Recent platform fees</div>
            {h.recent.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-c2">No platform fees found in the scanned deposits.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] text-c3 text-left">
                      <th className="px-4 py-2 font-normal">Date</th>
                      <th className="px-4 py-2 font-normal">From</th>
                      <th className="px-4 py-2 font-normal text-right">Volume</th>
                      <th className="px-4 py-2 font-normal text-right">Fee</th>
                      <th className="px-4 py-2 font-normal text-right">Referral</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {h.recent.map((r) => (
                      <tr key={r.extrinsic} style={{ borderTop: "1px solid var(--border-1)" }}>
                        <td className="px-4 py-2 text-c2 whitespace-nowrap">
                          {new Date(r.at).toLocaleString("en", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-2 font-mono text-[12px] text-c2">{truncateAddress(toAutonomysAddress(r.sender), 6, 4)}</td>
                        <td className="px-4 py-2 font-mono text-right text-c1">{formatAI3(BigInt(r.volume), 2)}</td>
                        <td className="px-4 py-2 font-mono text-right text-c1">{formatAI3(BigInt(r.treasury), 4)}</td>
                        <td className="px-4 py-2 font-mono text-right text-c3">{r.referral === "0" ? "—" : formatAI3(BigInt(r.referral), 4)}</td>
                        <td className="px-2 py-2">
                          <a
                            href={`${CHAINS.Mainnet.consensus.explorerBase}/extrinsic/${r.extrinsic}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Open in Subscan"
                            className="btn-ghost rounded-md p-1 inline-flex"
                          >
                            <ExternalLink size={12} className="text-c3" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="surface rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-c3">{label}</div>
      <div className="text-c1 font-mono font-medium text-lg mt-1 tabular-nums">{value}</div>
      {sub && <div className="text-[11.5px] text-c3 mt-0.5">{sub}</div>}
    </div>
  );
}

/** Daily fees, last 30 days. One series: accent bars, no legend, hover tooltip per bar. */
function FeeChart({ daily }: { daily: { day: string; fees: string; count: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = daily.map((d) => Number(BigInt(d.fees) / 10n ** 14n) / 1e4);
  const max = Math.max(...values, 0);
  const W = 600;
  const H = 160;
  const pad = { top: 12, bottom: 22, left: 4, right: 4 };
  const slot = (W - pad.left - pad.right) / daily.length;
  const barW = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => (max === 0 ? 0 : ((H - pad.top - pad.bottom) * v) / max);
  const hv = hover !== null ? daily[hover] : null;

  return (
    <figure className="surface rounded-2xl p-4 relative">
      <figcaption className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-c3">Daily platform fees · last 30 days</span>
        <span className="text-[11px] text-c3 font-mono">max {max.toFixed(2)} AI3</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Bar chart of daily platform fees for the last 30 days">
        <line x1={pad.left} x2={W - pad.right} y1={H - pad.bottom} y2={H - pad.bottom} stroke="var(--border-2)" strokeWidth="1" />
        {daily.map((d, i) => {
          const h = y(values[i]);
          const x = pad.left + i * slot + 1;
          const base = H - pad.bottom;
          const r = Math.min(4, barW / 2, h);
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {/* Hit target spans the full slot height, bigger than the bar */}
              <rect x={x - 1} y={pad.top} width={slot} height={base - pad.top} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${base} V${base - h + r} Q${x},${base - h} ${x + r},${base - h} H${x + barW - r} Q${x + barW},${base - h} ${x + barW},${base - h + r} V${base} Z`}
                  fill="#6E3AFF"
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
            </g>
          );
        })}
        {[0, Math.floor(daily.length / 2), daily.length - 1].map((i) => (
          <text key={i} x={pad.left + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--text-3)">
            {new Date(daily[i].day).toLocaleDateString("en", { month: "short", day: "numeric" })}
          </text>
        ))}
      </svg>
      {hv && hover !== null && (
        <div
          className="absolute pointer-events-none modal-surface rounded-lg px-2.5 py-1.5 text-[12px] shadow-lg"
          style={{ left: `calc(${((hover + 0.5) / daily.length) * 100}% )`, top: 28, transform: "translateX(-50%)" }}
        >
          <div className="text-c3">{new Date(hv.day).toLocaleDateString("en", { dateStyle: "medium" })}</div>
          <div className="text-c1 font-mono">{values[hover].toFixed(4)} AI3</div>
          <div className="text-c3">{hv.count} transfers</div>
        </div>
      )}
    </figure>
  );
}
