"use client";

import { useEffect, useState } from "react";

let cached: { usd: number; at: number } | null = null;

/** AI3 price in USD, refreshed every minute; null while unknown. */
export function useAi3Price(): number | null {
  const [usd, setUsd] = useState<number | null>(cached?.usd ?? null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      if (cached && Date.now() - cached.at < 60_000) return setUsd(cached.usd);
      try {
        const data = (await (await fetch("/api/price")).json()) as { usd: number | null };
        if (typeof data.usd === "number") {
          cached = { usd: data.usd, at: Date.now() };
          if (alive) setUsd(data.usd);
        }
      } catch {
        // price is optional
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return usd;
}

export function formatUsd(shannons: bigint, usdPerAi3: number | null): string | null {
  if (usdPerAi3 === null || shannons <= 0n) return null;
  const value = (Number(shannons / 10n ** 12n) / 1e6) * usdPerAi3;
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: value < 1 ? 4 : 2 });
}
