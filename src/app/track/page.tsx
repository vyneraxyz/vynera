"use client";

import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, ExternalLink, Search } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChainBadge } from "@/components/bridge/DirectionToggle";
import { Spinner } from "@/components/bridge/StatusTimeline";
import { toAutonomysAddress, truncateAddress } from "@/lib/autonomys/addresses";
import { formatAI3 } from "@/lib/autonomys/amounts";
import { CHAIN_LABEL, CHAIN_TOKEN, LEG_ETA } from "@/lib/routes";
import { track, type TrackedTransfer, type TrackResult } from "@/lib/tracker";

export default function TrackPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TrackResult | null>(null);

  const run = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setResult(null);
    setResult(await track(q));
    setLoading(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("q", q.trim());
      window.history.replaceState(null, "", url);
    } catch {
      // history unavailable
    }
  }, []);

  // Deep link: /track?q=<hash|id|address>
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery(q);
      run(q);
    }
  }, [run]);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-14 relative z-10">
      <div className="mesh-bg" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="w-full max-w-[520px]">
        <header className="flex items-center gap-3 mb-5 px-1">
          <Link href="/" className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center" aria-label="Back to bridge">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <h1 className="text-c1 text-base font-semibold tracking-tight">Track a transfer</h1>
            <p className="text-c3 text-[11.5px]">Where is my AI3? Works for any wallet, not just Vynera.</p>
          </div>
        </header>

        <main className="surface rounded-3xl p-5 sm:p-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(query);
            }}
            className="flex gap-2"
          >
            <label htmlFor="track-input" className="sr-only">
              Transaction hash, extrinsic ID or address
            </label>
            <input
              id="track-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="0x… tx hash, 10128913-34 or address"
              autoComplete="off"
              spellCheck={false}
              className="input flex-1 min-w-0 rounded-xl px-3.5 py-3 font-mono text-sm"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="btn-accent rounded-xl px-4 text-white flex items-center gap-2 text-sm font-medium"
            >
              {loading ? <Spinner size={14} /> : <Search size={14} />}
              Track
            </button>
          </form>

          <ul className="mt-3 text-[11.5px] text-c3 grid gap-0.5 px-1">
            <li>• Auto EVM or Ethereum tx hash — XDM and Hyperlane transfers</li>
            <li>• Consensus extrinsic ID from Subscan, e.g. 10128913-34</li>
            <li>• An address — lists its transfers still on their way</li>
          </ul>

          {result?.type === "error" && (
            <div className="mt-4 surface-2 rounded-2xl p-4 flex gap-2 items-start text-sm text-c1" role="alert">
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-c2" aria-hidden="true" />
              <span>{result.message}</span>
            </div>
          )}

          {result?.type === "transfers" && (
            <div className="mt-4 grid gap-3" aria-live="polite">
              {result.transfers.length === 0 && (
                <div className="surface-2 rounded-2xl p-4 text-sm text-c2">No transfers in flight for this address.</div>
              )}
              {result.transfers.map((t, i) => (
                <TransferCard key={`${t.kind}-${t.sender}-${i}`} t={t} />
              ))}
              {result.note && <p className="text-[11.5px] text-c3 px-1">{result.note}</p>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

const show = (chain: TrackedTransfer["from"], a: string) =>
  a ? truncateAddress(chain === "consensus" ? toAutonomysAddress(a) : a, 8, 6) : "—";

function TransferCard({ t }: { t: TrackedTransfer }) {
  const status =
    t.status === "delivered" ? (
      <span className="inline-flex items-center gap-1.5 text-accent text-xs font-medium">
        <CheckCircle2 size={13} aria-hidden="true" /> Delivered
      </span>
    ) : t.status === "failed" ? (
      <span className="inline-flex items-center gap-1.5 text-c2 text-xs font-medium">
        <AlertCircle size={13} aria-hidden="true" /> Failed
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-c1 text-xs font-medium">
        <Spinner size={12} /> In flight · usually {LEG_ETA[t.kind]}
      </span>
    );

  return (
    <div className="surface-2 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-sm text-c1 font-medium">
          <ChainBadge chain={t.from} size="sm" />
          {CHAIN_LABEL[t.from]}
          <ArrowRight size={13} className="text-c3" aria-hidden="true" />
          <ChainBadge chain={t.to} size="sm" />
          {CHAIN_LABEL[t.to]}
        </div>
        {status}
      </div>
      <div className="grid gap-1.5 text-sm">
        <Line label="Amount" value={t.amount > 0n ? `${formatAI3(t.amount, 4)} ${CHAIN_TOKEN[t.from]}` : "—"} />
        <Line label="From" value={show(t.from, t.sender)} mono />
        <Line label="To" value={show(t.to, t.receiver)} mono />
        {t.sentAt && <Line label="Sent" value={new Date(t.sentAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })} />}
      </div>
      {t.note && <p className="text-[11.5px] text-c3 mt-2">{t.note}</p>}
      {t.sourceUrl && (
        <a
          href={t.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-accent"
        >
          <ExternalLink size={12} aria-hidden="true" /> Open in explorer
        </a>
      )}
    </div>
  );
}

function Line({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-c3">{label}</span>
      <span className={`text-c1 ${mono ? "font-mono text-[12.5px]" : ""}`}>{value}</span>
    </div>
  );
}
