"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/store/wallet";

export function Providers({ children }: { children: React.ReactNode }) {
  const setTheme = useWalletStore((s) => s.setTheme);

  // Sync theme store with current html class on mount
  useEffect(() => {
    const isLight = document.documentElement.classList.contains("light");
    setTheme(isLight ? "light" : "dark");
  }, [setTheme]);

  return <>{children}</>;
}
