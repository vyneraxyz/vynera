"use client";

import { useCallback } from "react";
import { useWalletStore } from "@/store/wallet";
import type { WalletAccount } from "@/types";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Connection timed out")), ms)
    ),
  ]);
}

export function useWalletActions() {
  const {
    setConnected,
    setAccounts,
    selectAddress,
    setExtensionError,
    setBalance,
    setBalanceLoading,
    selectedAddress,
    disconnect,
    setEvmAddress,
    setEvmError,
    setEvmBalance,
    setEvmBalanceLoading,
    evmAddress,
    disconnectEvm,
  } = useWalletStore();

  const loadAccountsFromExtension = useCallback(
    async (showErrors = true): Promise<WalletAccount[]> => {
      if (typeof window === "undefined") return [];

      let web3Enable: (appName: string) => Promise<unknown[]>;
      let web3Accounts: () => Promise<
        Array<{ address: string; meta: { name?: string; source: string }; type?: string }>
      >;

      try {
        const mod = await import("@polkadot/extension-dapp");
        web3Enable = mod.web3Enable;
        web3Accounts = mod.web3Accounts;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load wallet extension";
        if (showErrors) setExtensionError(msg);
        return [];
      }

      try {
        const extensions = await web3Enable("Vynera");
        if (extensions.length === 0) {
          if (showErrors) {
            setExtensionError(
              "No wallet extension found. Install SubWallet, Talisman, or polkadot{.js}."
            );
          }
          return [];
        }

        const rawAccounts = await web3Accounts();
        const accounts: WalletAccount[] = rawAccounts.map((a) => ({
          address: a.address,
          name: a.meta.name ?? a.address.slice(0, 8),
          source: a.meta.source,
          type: a.type,
        }));

        if (accounts.length === 0) {
          if (showErrors) {
            setExtensionError(
              "No accounts found. Create or import an account in your wallet extension."
            );
          }
          return [];
        }

        setAccounts(accounts);
        setConnected(true);
        setExtensionError(null);

        // Auto-select: restore saved or pick first
        const saved = (() => {
          try {
            return localStorage.getItem("xdm-wallet-address");
          } catch {
            return null;
          }
        })();
        const match = saved && accounts.find((a) => a.address === saved);
        selectAddress(match ? match.address : accounts[0].address);

        return accounts;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to connect wallet";
        if (showErrors) setExtensionError(msg);
        return [];
      }
    },
    [setConnected, setAccounts, selectAddress, setExtensionError]
  );

  const fetchBalance = useCallback(async () => {
    if (!selectedAddress) return;
    setBalanceLoading(true);
    try {
      const { getApi } = await import("@/lib/autonomys/api");
      const { CHAINS } = await import("@/lib/constants");
      const chainConfig = CHAINS.Mainnet;
      const free = await withTimeout(
        (async () => {
          const api = await getApi(chainConfig.consensus.rpc);
          const result = await api.query.system.account(selectedAddress);
          return ((result as unknown) as { data: { free: { toBigInt(): bigint } } }).data.free.toBigInt();
        })(),
        12_000,
      );
      setBalance(free);
    } catch (err: unknown) {
      console.error("Failed to fetch balance:", err);
    } finally {
      setBalanceLoading(false);
    }
  }, [selectedAddress, setBalance, setBalanceLoading]);

  const connectEvm = useCallback(async () => {
    const { connectEvmWallet } = await import("@/lib/evm/wallet");
    try {
      const conn = await connectEvmWallet();
      setEvmAddress(conn.address, conn.walletName);
      try { localStorage.setItem("xdm-evm-address", conn.address); } catch { /* noop */ }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to connect EVM wallet";
      setEvmError(msg);
    }
  }, [setEvmAddress, setEvmError]);

  const disconnectEvmWallet = useCallback(() => {
    disconnectEvm();
    try { localStorage.removeItem("xdm-evm-address"); } catch { /* noop */ }
  }, [disconnectEvm]);

  const fetchEvmBalance = useCallback(async () => {
    if (!evmAddress) return;
    setEvmBalanceLoading(true);
    try {
      const { getApi } = await import("@/lib/autonomys/api");
      const { CHAINS } = await import("@/lib/constants");
      const balance = await withTimeout(
        (async () => {
          const api = await getApi(CHAINS.Mainnet.evm.rpc);
          let bal: bigint | null = null;

          // Frontier exposes eth_getBalance on the Substrate WS port
          try {
            type EthRpc = { getBalance(addr: string): Promise<{ toBigInt?(): bigint; toString(): string }> };
            const ethRpc = (api.rpc as unknown as { eth?: EthRpc }).eth;
            if (ethRpc?.getBalance) {
              const result = await ethRpc.getBalance(evmAddress);
              bal = result.toBigInt ? result.toBigInt() : BigInt(result.toString());
            }
          } catch {
            // eth namespace unavailable on this node
          }

          // HTTP JSON-RPC fallback
          if (bal === null) {
            try {
              const res = await fetch(CHAINS.Mainnet.evm.httpRpc, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", method: "eth_getBalance", params: [evmAddress, "latest"], id: 1 }),
              });
              const data = (await res.json()) as { result?: string };
              if (data.result) bal = BigInt(data.result);
            } catch {
              // HTTP endpoint unavailable
            }
          }

          // MetaMask/Rabby provider as last resort
          if (bal === null) {
            const { getEvmBalance } = await import("@/lib/evm/wallet");
            bal = await getEvmBalance(evmAddress);
          }

          return bal;
        })(),
        12_000,
      );
      setEvmBalance(balance);
    } catch (err: unknown) {
      console.error("Failed to fetch EVM balance:", err);
    } finally {
      setEvmBalanceLoading(false);
    }
  }, [evmAddress, setEvmBalance, setEvmBalanceLoading]);

  return { loadAccountsFromExtension, fetchBalance, fetchEvmBalance, disconnect, connectEvm, disconnectEvmWallet };
}
