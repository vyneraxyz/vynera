"use client";

import { motion } from "framer-motion";
import { ArrowLeftRight } from "lucide-react";
import Image from "next/image";
import type { Direction } from "@/types";

interface Props {
  direction: Direction;
  onChange: (next: Direction) => void;
}

function ChainBadge({ chain, size = "md" }: { chain: string; size?: "sm" | "md" | "lg" }) {
  const isC = chain === "consensus";
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
          : undefined,
        color: "#fff",
        border: isC ? "none" : "1px solid rgba(110,58,255,0.55)",
        boxShadow: isC
          ? "0 0 0 1px rgba(110,58,255,0.4), 0 4px 12px -2px rgba(110,58,255,0.55)"
          : "0 0 0 1px rgba(110,58,255,0.18)",
      }}
    >
      {isC ? (
        <Image src="/autonomys_consensus_logo.png" alt="Consensus" width={dim} height={dim} />
      ) : (
        <Image src="/autonomys_logo.png" alt="Auto EVM" width={dim} height={dim} />
      )}
    </div>
  );
}

function ChainLabel({ chain }: { chain: string }) {
  return (
    <span className="text-c1 font-medium">
      {chain === "consensus" ? "Consensus" : "Auto EVM"}
    </span>
  );
}

export { ChainBadge, ChainLabel };

export function DirectionToggle({ direction, onChange }: Props) {
  const [rotating, setRotating] = useState(false);
  const left = direction === "c2e" ? "consensus" : "evm";
  const right = direction === "c2e" ? "evm" : "consensus";

  const swap = () => {
    setRotating((r) => !r);
    onChange(direction === "c2e" ? "e2c" : "c2e");
  };

  return (
    <fieldset className="seg" aria-label="Bridge direction" style={{ border: "none", padding: 0, margin: 0 }}>
      <div className="seg-pill active">
        <ChainBadge chain={left} size="sm" />
        <div className="flex flex-col items-start text-left">
          <span className="text-[10px] uppercase tracking-wider text-c3">From</span>
          <ChainLabel chain={left} />
        </div>
      </div>

      <motion.button
        onClick={swap}
        aria-label="Swap direction"
        className="seg-swap"
        animate={{ rotate: rotating ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <ArrowLeftRight size={18} />
      </motion.button>

      <div className="seg-pill active">
        <div className="flex flex-col items-end text-right">
          <span className="text-[10px] uppercase tracking-wider text-c3">To</span>
          <ChainLabel chain={right} />
        </div>
        <ChainBadge chain={right} size="sm" />
      </div>
    </fieldset>
  );
}

// Local useState import
import { useState } from "react";
