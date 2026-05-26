"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, RefreshCw } from "lucide-react";
import { useCallback, useState } from "react";
import { toAutonomysAddress, truncateAddress } from "@/lib/autonomys/addresses";
import { formatAI3 } from "@/lib/autonomys/amounts";
import type { Chain } from "@/types";
import { ChainBadge } from "./DirectionToggle";

interface Props {
  chain: Chain;
  address: string | null;
  balanceShannons: bigint;
  onRefresh: () => void;
  refreshing: boolean;
  disabled?: boolean;
}

function AddressChip({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable
    }
  }, [address]);

  return (
    <button
      type="button"
      onClick={copy}
      className="tip-trigger relative inline-flex items-center gap-1.5 px-2 py-1 -mx-2 -my-1 rounded-md transition hover:bg-white/[0.04] font-mono text-c1"
      title={address}
    >
      <span>{truncateAddress(address, 6, 6)}</span>
      <span className="text-c3">
        <AnimatePresence mode="wait">
          {copied ? (
            <motion.span
              key="check"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="inline-block"
            >
              <Check size={13} />
            </motion.span>
          ) : (
            <motion.span key="copy" className="inline-block">
              <Copy size={13} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span className="tip">{copied ? "Copied" : "Click to copy"}</span>
    </button>
  );
}

export function SenderBlock({
  chain,
  address,
  balanceShannons,
  onRefresh,
  refreshing,
  disabled,
}: Props) {
  return (
    <div
      className={`surface-2 rounded-2xl p-4 ${disabled ? "opacity-50 pointer-events-none" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-c3">From wallet</span>
        <button
          type="button"
          onClick={onRefresh}
          className="tip-trigger relative text-c3 hover:text-c1 transition p-1 -m-1 rounded-md"
          aria-label="Refresh balance"
        >
          <motion.span
            animate={{ rotate: refreshing ? 360 : 0 }}
            transition={
              refreshing
                ? { duration: 0.7, repeat: Infinity, ease: "linear" }
                : { duration: 0 }
            }
            className="inline-block"
          >
            <RefreshCw size={13} />
          </motion.span>
          <span className="tip">Refresh balance</span>
        </button>
      </div>

      <div className="flex items-center justify-between">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={chain}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-2.5 min-w-0"
          >
            <ChainBadge chain={chain} size="md" />
            <div className="min-w-0">
              {address ? (
                <AddressChip address={chain === "consensus" ? toAutonomysAddress(address) : address} />
              ) : (
                <span className="font-mono text-c3 text-sm">—</span>
              )}
              <div className="text-[11px] text-c3 -mt-0.5 ml-0.5">
                {chain === "consensus" ? "Consensus chain" : "Auto EVM domain"}
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="text-right shrink-0 ml-3">
          <div className="text-[11px] uppercase tracking-wider text-c3">Balance</div>
          <div className="text-c1 text-base font-medium">
            <span className="font-mono tabular-nums">
              {formatAI3(balanceShannons, 4)}
            </span>{" "}
            <span className="text-c3 font-mono text-xs">AI3</span>
          </div>
        </div>
      </div>
    </div>
  );
}
