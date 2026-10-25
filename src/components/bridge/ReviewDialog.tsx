"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Info, X } from "lucide-react";
import { toAutonomysAddress, truncateAddress, type RecipientNotice } from "@/lib/autonomys/addresses";
import { formatAI3, formatShannons } from "@/lib/autonomys/amounts";
import { formatUsd, useAi3Price } from "@/lib/price";
import { CHAIN_LABEL, CHAIN_TOKEN } from "@/lib/routes";
import type { RouteQuote } from "@/lib/transfer/quote";
import type { Chain } from "@/types";
import { ChainBadge } from "./DirectionToggle";
import { QuoteRows, Row as SummaryRow } from "./SummaryCard";

interface Props {
  from: Chain;
  to: Chain;
  quote: RouteQuote;
  fromAddress: string;
  toAddress: string;
  recipientNotice?: RecipientNotice | null;
  onConfirm: () => void;
  onClose: () => void;
}

function RouteVisual({
  fromChain,
  toChain,
  fromAddr,
  toAddr,
  animated = false,
  via,
}: {
  fromChain: string;
  toChain: string;
  fromAddr: string;
  toAddr: string;
  animated?: boolean;
  /** Bridge label under the arrow; defaults from the chain pair */
  via?: string;
}) {
  const bridge =
    via ??
    (fromChain === "ethereum" || toChain === "ethereum"
      ? fromChain === "consensus" || toChain === "consensus"
        ? "XDM + Hyperlane"
        : "Hyperlane"
      : "XDM");
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex flex-col items-center text-center flex-1">
        <ChainBadge chain={fromChain} size="lg" />
        <div className="mt-2 text-[11px] uppercase tracking-wider text-c3">From</div>
        <div className="text-c1 text-sm font-medium">
          {CHAIN_LABEL[fromChain as Chain] ?? fromChain}
        </div>
        <div className="font-mono text-[11px] text-c3 mt-0.5">
          {truncateAddress(fromAddr, 6, 4)}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center px-2">
        <svg
          width="100%"
          height="36"
          viewBox="0 0 120 36"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="route-grad" x1="0" x2="1">
              <stop offset="0%" stopColor="#6E3AFF" stopOpacity="0.15" />
              <stop offset="60%" stopColor="#6E3AFF" stopOpacity="1" />
              <stop offset="100%" stopColor="#6E3AFF" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path d="M2 18 L118 18" stroke="rgba(255,255,255,0.08)" strokeWidth="1.5" />
          <path
            d="M2 18 L118 18"
            stroke="url(#route-grad)"
            strokeWidth="2"
            strokeLinecap="round"
            className={animated ? "arrow-flow" : ""}
          />
          <path
            d="M111 12 L118 18 L111 24"
            stroke="#6E3AFF"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="text-[10px] uppercase tracking-wider text-c3 mt-1 text-center">{bridge}</div>
      </div>

      <div className="flex flex-col items-center text-center flex-1">
        <ChainBadge chain={toChain} size="lg" />
        <div className="mt-2 text-[11px] uppercase tracking-wider text-c3">To</div>
        <div className="text-c1 text-sm font-medium">
          {CHAIN_LABEL[toChain as Chain] ?? toChain}
        </div>
        <div className="font-mono text-[11px] text-c3 mt-0.5">
          {truncateAddress(toAddr, 6, 4)}
        </div>
      </div>
    </div>
  );
}

export { RouteVisual };

export function ReviewDialog({ from, to, quote, fromAddress, toAddress, recipientNotice, onConfirm, onClose }: Props) {
  const usd = useAi3Price();
  const [acknowledged, setAcknowledged] = useState(false);
  const needsAck = !!recipientNotice?.requiresAck;
  const canConfirm = !needsAck || acknowledged;
  const fromChain = from;
  const toChain = to;
  const parsed = quote.legs[0].amount;
  const total = parsed + quote.sourceGas;
  const multiLeg = quote.legs.length > 1;
  const usdValue = formatUsd(parsed, usd);

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40"
        style={{
          background: "var(--modal-backdrop)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
        }}
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className="fixed inset-0 flex items-center justify-center p-0 sm:p-4 pointer-events-none z-50"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
      >
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          className="pointer-events-auto w-full sm:max-w-[520px] h-full sm:h-auto overflow-auto"
        >
          <div className="modal-surface rounded-none sm:rounded-3xl h-full sm:h-auto p-6 flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <h2 id="review-title" className="text-c1 text-lg font-semibold tracking-tight">
                Review transfer
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center"
                aria-label="Close"
              >
                <X size={15} />
              </button>
            </div>

            {/* Amount + Route */}
            <div className="surface-2 rounded-2xl p-5 mb-4">
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wider text-c3">You are sending</div>
                <div className="mt-1 text-4xl font-semibold font-mono tracking-tight text-c1">
                  {formatAI3(parsed, 4)}
                  <span className="text-c2 text-base font-medium ml-2">{CHAIN_TOKEN[from]}</span>
                </div>
                <div className="text-c3 text-[11px] mt-1 font-mono">
                  {usdValue ? `≈ ${usdValue} · ` : ""}
                  {formatShannons(parsed)}
                </div>
              </div>
              <div className="mt-5">
                <RouteVisual
                  fromChain={fromChain}
                  toChain={toChain}
                  fromAddr={fromChain === "consensus" ? toAutonomysAddress(fromAddress) : fromAddress}
                  toAddr={toChain === "consensus" ? toAutonomysAddress(toAddress) : toAddress}
                />
              </div>
            </div>

            {/* Fee breakdown */}
            <div className="surface-2 rounded-2xl p-4 grid gap-2 text-sm mb-4">
              <QuoteRows from={from} to={to} quote={quote} />
              <div style={{ borderTop: "1px solid var(--border-1)" }} />
              <SummaryRow
                label={<span className="text-c1 font-medium">Total deducted</span>}
                value={
                  <span className="text-c1 font-mono font-medium">
                    {formatAI3(total, 4)} {CHAIN_TOKEN[from]}
                  </span>
                }
              />
            </div>

            {/* Recipient warning */}
            {recipientNotice?.level === "warning" && (
              <div
                role="alert"
                className="rounded-xl px-3 py-2.5 grid gap-2 text-[12.5px] mb-3"
                style={{
                  background: "var(--warning-bg)",
                  border: "1px solid var(--warning-border)",
                  color: "var(--text-1)",
                }}
              >
                <div className="flex gap-2 items-start">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
                  <span>{recipientNotice.message}</span>
                </div>
                {needsAck && (
                  <label className="flex gap-2 items-center cursor-pointer select-none ml-[22px]">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    <span>I control this address and want to send funds to it</span>
                  </label>
                )}
              </div>
            )}

            {/* Info banner */}
            <div
              className="rounded-xl px-3 py-2.5 flex gap-2 items-start text-[12.5px] mb-5"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid var(--border-1)",
                color: "var(--text-2)",
              }}
            >
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {multiLeg
                  ? `This route has two steps. After step 1 arrives on ${CHAIN_LABEL[quote.legs[0].to]}, Vynera asks you to sign step 2 — keep this page open or come back later.`
                  : "Tokens become available on the destination once the bridge delivers them. Vynera tracks the transfer and can notify you."}
              </span>
            </div>

            {/* Actions */}
            <div className="mt-auto flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-ghost rounded-xl py-3 px-4 flex-1 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={!canConfirm}
                className="btn-accent rounded-xl py-3 px-4 flex-[2] text-sm font-medium text-white disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {multiLeg ? "Sign step 1" : "Confirm in wallet"}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </>
  );
}
