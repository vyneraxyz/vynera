"use client";

import { useEffect } from "react";
import { useWalletStore } from "@/store/wallet";
import { useWalletActions } from "./useWalletActions";

/** Bootstraps wallet state from extension on mount. */
export function WalletProvider({ children }: { children: React.ReactNode }) {
  const { loadAccountsFromExtension } = useWalletActions();
  const selectedAddress = useWalletStore((s) => s.selectedAddress);
  const { setEvmAddress, disconnectEvm } = useWalletStore();

  // Silent reconnect substrate wallet if address was previously saved
  useEffect(() => {
    const saved = (() => {
      try { return localStorage.getItem("xdm-wallet-address"); } catch { return null; }
    })();
    if (saved) loadAccountsFromExtension(false).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silent reconnect EVM wallet + subscribe to account changes
  useEffect(() => {
    const savedEvm = (() => {
      try { return localStorage.getItem("xdm-evm-address"); } catch { return null; }
    })();

    let cleanup = () => {};

    if (savedEvm) {
      import("@/lib/evm/wallet").then(({ getConnectedEvmAccount, detectEvmWalletName, onEvmAccountsChanged }) => {
        getConnectedEvmAccount().then((addr) => {
          if (addr) setEvmAddress(addr, detectEvmWalletName());
        }).catch(() => {});

        cleanup = onEvmAccountsChanged((accounts) => {
          if (accounts.length === 0) {
            disconnectEvm();
            try { localStorage.removeItem("xdm-evm-address"); } catch { /* noop */ }
          } else {
            setEvmAddress(accounts[0], detectEvmWalletName());
            try { localStorage.setItem("xdm-evm-address", accounts[0]); } catch { /* noop */ }
          }
        });
      }).catch(() => {});
    }

    return () => cleanup();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selected substrate address
  useEffect(() => {
    try {
      if (selectedAddress) {
        localStorage.setItem("xdm-wallet-address", selectedAddress);
      } else {
        localStorage.removeItem("xdm-wallet-address");
      }
    } catch { /* noop */ }
  }, [selectedAddress]);

  return <>{children}</>;
}

export { useWalletActions };
