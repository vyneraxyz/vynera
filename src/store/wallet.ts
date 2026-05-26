"use client";

import { create } from "zustand";
import type { WalletAccount } from "@/types";

interface WalletState {
  connected: boolean;
  accounts: WalletAccount[];
  selectedAddress: string | null;
  theme: "dark" | "light";
  /** Balance in Shannons */
  balanceShannons: bigint;
  balanceLoading: boolean;
  extensionError: string | null;

  evmAddress: string | null;
  evmWalletName: string | null;
  evmError: string | null;
  evmBalanceShannons: bigint;
  evmBalanceLoading: boolean;

  setConnected: (v: boolean) => void;
  setAccounts: (accounts: WalletAccount[]) => void;
  selectAddress: (address: string) => void;
  setTheme: (t: "dark" | "light") => void;
  setBalance: (shannons: bigint) => void;
  setBalanceLoading: (v: boolean) => void;
  setExtensionError: (msg: string | null) => void;
  disconnect: () => void;

  setEvmAddress: (address: string | null, walletName: string | null) => void;
  setEvmError: (msg: string | null) => void;
  setEvmBalance: (b: bigint) => void;
  setEvmBalanceLoading: (v: boolean) => void;
  disconnectEvm: () => void;
}

export const useWalletStore = create<WalletState>()((set) => ({
  connected: false,
  accounts: [],
  selectedAddress: null,
  theme: "dark",
  balanceShannons: 0n,
  balanceLoading: false,
  extensionError: null,
  evmAddress: null,
  evmWalletName: null,
  evmError: null,
  evmBalanceShannons: 0n,
  evmBalanceLoading: false,

  setConnected: (v) => set({ connected: v }),
  setAccounts: (accounts) => set({ accounts }),
  selectAddress: (address) => set({ selectedAddress: address }),
  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== "undefined") {
      if (theme === "light") {
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
      }
      try {
        localStorage.setItem("xdm-theme", theme);
      } catch {
        // storage unavailable
      }
    }
  },
  setBalance: (balanceShannons) => set({ balanceShannons }),
  setBalanceLoading: (v) => set({ balanceLoading: v }),
  setExtensionError: (msg) => set({ extensionError: msg }),
  disconnect: () =>
    set({ connected: false, accounts: [], selectedAddress: null, balanceShannons: 0n }),

  setEvmAddress: (address, walletName) => set({ evmAddress: address, evmWalletName: walletName, evmError: null }),
  setEvmError: (msg) => set({ evmError: msg }),
  setEvmBalance: (evmBalanceShannons) => set({ evmBalanceShannons }),
  setEvmBalanceLoading: (v) => set({ evmBalanceLoading: v }),
  disconnectEvm: () => set({ evmAddress: null, evmWalletName: null, evmError: null, evmBalanceShannons: 0n }),
}));
