"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeftRight, Check, ChevronDown } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { CHAIN_LABEL } from "@/lib/routes";
import type { Chain } from "@/types";

const CHAINS: Chain[] = ["consensus", "evm", "ethereum"];

function EthereumGlyph({ dim }: { dim: number }) {
  return (
    <svg width={dim * 0.55} height={dim * 0.55} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 5 12.2 12 16l7-3.8L12 2Z" fill="#fff" fillOpacity="0.92" />
      <path d="M12 17.4 5 13.6 12 22l7-8.4-7 3.8Z" fill="#fff" fillOpacity="0.7" />
    </svg>
  );
}

function ChainBadge({ chain, size = "md" }: { chain: string; size?: "sm" | "md" | "lg" }) {
  const isC = chain === "consensus";
  const isEth = chain === "ethereum";
  const dim = size === "sm" ? 22 : size === "lg" ? 36 : 28;
  return (
    <div
      className="rounded-full flex items-center justify-center font-mono font-semibold relative shrink-0 overflow-hidden"
      style={{
        width: dim,
        height: dim,
        fontSize: dim * 0.42,
        background: isC
          ? "radial-gradient(circle at 30% 28%, #9c7bff, #6E3AFF 60%, #4520c4)"
          : isEth
            ? "radial-gradient(circle at 30% 28%, #8a9ef5, #5470e0 60%, #3a4fb0)"
            : undefined,
        color: "#fff",
        border: isC || isEth ? "none" : "1px solid rgba(110,58,255,0.55)",
        boxShadow: isC
          ? "0 0 0 1px rgba(110,58,255,0.4), 0 4px 12px -2px rgba(110,58,255,0.55)"
          : isEth
            ? "0 0 0 1px rgba(84,112,224,0.4), 0 4px 12px -2px rgba(84,112,224,0.5)"
            : "0 0 0 1px rgba(110,58,255,0.18)",
      }}
    >
      {isC ? (
        <Image src="/autonomys_consensus_logo.png" alt="Consensus" width={dim} height={dim} />
      ) : isEth ? (
        <EthereumGlyph dim={dim} />
      ) : (
        <Image src="/autonomys_logo.png" alt="Auto EVM" width={dim} height={dim} />
      )}
    </div>
  );
}

function ChainLabel({ chain }: { chain: string }) {
  return <span className="text-c1 font-medium">{CHAIN_LABEL[chain as Chain] ?? chain}</span>;
}

export { ChainBadge, ChainLabel };

interface Props {
  from: Chain;
  to: Chain;
  onChange: (from: Chain, to: Chain) => void;
}

function ChainPicker({
  side,
  value,
  other,
  onPick,
}: {
  side: "From" | "To";
  value: Chain;
  other: Chain;
  onPick: (c: Chain) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    // Raise the open pill above its siblings so the menu and backdrop cover them
    <div className="seg-pill active relative" style={open ? { zIndex: 50 } : undefined}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${side} network: ${CHAIN_LABEL[value]}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={value}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            className="flex items-center gap-2 min-w-0"
          >
            <ChainBadge chain={value} size="sm" />
            <div className="flex flex-col items-start text-left min-w-0">
              <span className="text-[10px] uppercase tracking-wider text-c3">{side}</span>
              <ChainLabel chain={value} />
            </div>
          </motion.div>
        </AnimatePresence>
        <ChevronDown size={12} className={`ml-auto text-c3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.ul
              role="listbox"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-0 right-0 top-full mt-1.5 modal-surface rounded-xl p-1 z-50"
            >
              {CHAINS.map((c) => (
                <li key={c}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={c === value}
                    onClick={() => {
                      onPick(c);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-white/[0.05] transition text-sm"
                  >
                    <ChainBadge chain={c} size="sm" />
                    <ChainLabel chain={c} />
                    {c === other && <span className="text-[10px] text-c3 ml-1">swap</span>}
                    {c === value && <Check size={13} className="ml-auto text-accent" />}
                  </button>
                </li>
              ))}
            </motion.ul>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RouteSelector({ from, to, onChange }: Props) {
  const [rotating, setRotating] = useState(false);

  // Picking the chain already on the other side swaps them
  const pickFrom = (c: Chain) => onChange(c, c === to ? from : to);
  const pickTo = (c: Chain) => onChange(c === from ? to : from, c);

  return (
    <fieldset className="seg" aria-label="Bridge route" style={{ border: "none", padding: 0, margin: 0 }}>
      <ChainPicker side="From" value={from} other={to} onPick={pickFrom} />

      <motion.button
        type="button"
        onClick={() => {
          setRotating((r) => !r);
          onChange(to, from);
        }}
        aria-label="Swap direction"
        className="seg-swap"
        animate={{ rotate: rotating ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <ArrowLeftRight size={18} />
      </motion.button>

      <ChainPicker side="To" value={to} other={from} onPick={pickTo} />
    </fieldset>
  );
}
