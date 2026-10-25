"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Shield, ChevronDown, ArrowRight, Gift } from "lucide-react";
import { formatAI3 } from "@/lib/autonomys/amounts";
import { effectiveFeePct, FEE_BPS_ABOVE, FEE_BPS_BASE, FEE_TIER_THRESHOLD } from "@/lib/fees";
import { NETWORK_FEE_SHANNONS } from "@/lib/constants";
import { CHAIN_LABEL, CHAIN_TOKEN, HOP_GAS_RESERVE, LEG_ETA, planRoute } from "@/lib/routes";
import type { RouteQuote } from "@/lib/transfer/quote";
import type { Chain } from "@/types";

interface Props {
  from: Chain;
  to: Chain;
  quote: RouteQuote | null;
  expanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function Row({
  label,
  value,
  hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-c2">{label}</div>
        {hint && <div className="text-c3 text-[11px]">{hint}</div>}
      </div>
      <div className="text-c1 text-right">{value}</div>
    </div>
  );
}

export const FEE_TIER_HINT =
  FEE_BPS_BASE === FEE_BPS_ABOVE
    ? `${FEE_BPS_BASE / 100}% of the amount`
    : `${FEE_BPS_BASE / 100}% up to ${formatAI3(FEE_TIER_THRESHOLD, 0)} AI3, ${FEE_BPS_ABOVE / 100}% above`;

/** Fee, gas and per-leg route lines shared by the summary and the review dialog */
export function QuoteRows({ from, to, quote }: { from: Chain; to: Chain; quote: RouteQuote | null }) {
  // Without an amount there's no quote yet — still show the route and its fee rule
  const legs = quote?.legs ?? planRoute(from, to);
  const charged = legs[0]?.kind === "xdm-c2e";
  const token = CHAIN_TOKEN[to];
  return (
    <>
      <Row
        label="Recipient receives"
        value={
          <span className="font-mono">
            {quote ? formatAI3(quote.receives, 4) : "—"} {token}
          </span>
        }
      />

      {quote?.fee ? (
        <Row
          label={<span className="text-c3">Platform fee ({effectiveFeePct(quote.legs[0].amount)})</span>}
          hint={FEE_TIER_HINT}
          value={<span className="font-mono text-c3">{formatAI3(quote.fee.fee, 4)} AI3</span>}
        />
      ) : charged ? (
        <Row label={<span className="text-c3">Platform fee</span>} hint={FEE_TIER_HINT} value={<span className="text-c3">—</span>} />
      ) : (
        <Row label={<span className="text-c3">Platform fee</span>} value={<span className="text-c3">free</span>} />
      )}

      {quote?.fee && quote.fee.referral > 0n && (
        <Row
          label={
            <span className="text-c3 inline-flex items-center gap-1">
              <Gift size={11} aria-hidden="true" /> Of which to your referrer
            </span>
          }
          value={<span className="font-mono text-c3">{formatAI3(quote.fee.referral, 4)} AI3</span>}
        />
      )}

      <Row
        label="Network fee"
        hint={from === "ethereum" ? "Paid in ETH by your wallet" : "Source chain gas"}
        value={
          <span className="font-mono">
            {from === "ethereum" ? "ETH gas" : `${formatAI3(quote?.sourceGas ?? NETWORK_FEE_SHANNONS, 4)} AI3`}
          </span>
        }
      />

      {legs.length > 1 && (
        <Row
          label="Kept on Auto EVM for step 2 gas"
          value={<span className="font-mono">{formatAI3(quote?.hopReserve ?? HOP_GAS_RESERVE, 2)} AI3</span>}
        />
      )}

      <Row
        label="Route"
        hint={legs.length > 1 ? "Two steps — you sign each one" : undefined}
        value={
          <span className="flex flex-col items-end gap-0.5 font-mono text-xs">
            {legs.map((l) => (
              <span key={`${l.from}-${l.to}`} className="flex items-center gap-1.5">
                {CHAIN_LABEL[l.from]}
                <ArrowRight size={12} className="text-c3" />
                {CHAIN_LABEL[l.to]}
                <span className="text-c3">{LEG_ETA[l.kind]}</span>
              </span>
            ))}
          </span>
        }
      />
    </>
  );
}

export function SummaryCard({ from, to, quote, expanded, onToggle, disabled }: Props) {
  const total = (quote?.legs[0]?.amount ?? 0n) + (quote?.sourceGas ?? 0n);

  return (
    <div className={`surface-2 rounded-2xl ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3"
        aria-expanded={expanded}
        aria-controls="summary-details"
      >
        <div className="flex items-center gap-2 text-sm">
          <Shield size={14} className="text-c3" />
          <span className="text-c2">Transaction summary</span>
        </div>
        <div className="flex items-center gap-2 text-c2 text-xs">
          <span className="font-mono">
            {formatAI3(total, 4)} {CHAIN_TOKEN[from]}
          </span>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="inline-block"
          >
            <ChevronDown size={14} />
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="summary-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 -mt-1 grid gap-2 text-sm">
              <div style={{ borderTop: "1px solid var(--border-1)" }} />
              <QuoteRows from={from} to={to} quote={quote} />
              <div style={{ borderTop: "1px solid var(--border-1)" }} />
              <Row
                label={<span className="text-c1 font-medium">Total deducted</span>}
                value={
                  <span className="text-c1 font-mono font-medium">
                    {formatAI3(total, 4)} {CHAIN_TOKEN[from]}
                  </span>
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
