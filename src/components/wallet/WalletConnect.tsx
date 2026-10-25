"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronDown, ExternalLink, LogOut, RefreshCw, Smartphone, Wallet } from "lucide-react";
import type { DiscoveredWallet } from "@/lib/evm/wallet";
import { toAutonomysAddress, truncateAddress } from "@/lib/autonomys/addresses";
import { useWalletStore } from "@/store/wallet";
import type { WalletAccount } from "@/types";
import { useWalletActions } from "./useWalletActions";

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="Close"
      className="fixed inset-0 z-40"
      style={{ background: "transparent", cursor: "default" }}
      onClick={onClose}
    />
  );
}

export function WalletConnect() {
  const {
    connected, accounts, selectedAddress, extensionError,
    evmAddress, evmWalletName, evmError,
  } = useWalletStore();
  const { loadAccountsFromExtension, disconnect, connectEvm, disconnectEvmWallet } = useWalletActions();
  const [open, setOpen] = useState(false);
  const [loadingSubstrate, setLoadingSubstrate] = useState(false);
  const [loadingEvm, setLoadingEvm] = useState(false);

  const handleConnectSubstrate = async () => {
    setLoadingSubstrate(true);
    await loadAccountsFromExtension(true);
    setLoadingSubstrate(false);
  };

  const handleConnectEvm = async (rdns?: string) => {
    setLoadingEvm(true);
    await connectEvm(rdns);
    setLoadingEvm(false);
  };

  const anyConnected = connected || !!evmAddress;

  if (!anyConnected) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={loadingSubstrate}
          className="btn-ghost rounded-full px-3 py-1.5 flex items-center gap-2 text-xs"
          aria-label="Connect wallet"
        >
          {loadingSubstrate ? <RefreshCw size={14} className="spin-anim" /> : <Wallet size={14} />}
          <span>Connect</span>
        </button>

        <AnimatePresence>
          {open && (
            <>
              <Backdrop onClose={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
                className="absolute right-0 top-full mt-2 w-64 modal-surface rounded-2xl p-2 z-50"
              >
                <ConnectSection
                  onConnectSubstrate={handleConnectSubstrate}
                  onConnectEvm={handleConnectEvm}
                  loadingSubstrate={loadingSubstrate}
                  loadingEvm={loadingEvm}
                  extensionError={extensionError}
                  evmError={evmError}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn-ghost rounded-full pl-1 pr-3 py-1 flex items-center gap-2 text-xs"
        aria-label="Wallet menu"
        aria-expanded={open}
      >
        <WalletAvatar address={selectedAddress ?? evmAddress ?? ""} />
        <span className="font-mono text-c1">
          {selectedAddress
            ? truncateAddress(toAutonomysAddress(selectedAddress), 4, 4)
            : truncateAddress(evmAddress ?? "", 4, 4)}
        </span>
        {connected && evmAddress && (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: "#6E3AFF" }}
            title="EVM wallet also connected"
            aria-hidden="true"
          />
        )}
        <ChevronDown
          size={12}
          className={`text-c3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <Backdrop onClose={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.2, 0.7, 0.2, 1] }}
              className="absolute right-0 top-full mt-2 w-64 modal-surface rounded-2xl p-2 z-50"
            >
              {/* Substrate accounts */}
              <div className="px-2 py-1 mb-1">
                <p className="text-[10px] uppercase tracking-wider text-c3">Substrate</p>
              </div>
              {connected && accounts.length > 0 ? (
                <>
                  {accounts.map((account) => (
                    <AccountRow
                      key={account.address}
                      account={account}
                      isSelected={account.address === selectedAddress}
                      onSelect={() => {
                        useWalletStore.getState().selectAddress(account.address);
                        setOpen(false);
                      }}
                    />
                  ))}
                  <div className="my-1" style={{ borderTop: "1px solid var(--border-1)" }} />
                  <button
                    type="button"
                    onClick={() => { disconnect(); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-c2 hover:text-c1 hover:bg-white/[0.04] transition"
                  >
                    <LogOut size={13} /> Disconnect substrate
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectSubstrate}
                  disabled={loadingSubstrate}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-c2 hover:text-c1 hover:bg-white/[0.04] transition"
                >
                  {loadingSubstrate ? <RefreshCw size={13} className="spin-anim" /> : <Wallet size={13} />}
                  Connect SubWallet / Talisman
                </button>
              )}
              {extensionError && (
                <p className="text-[10px] text-c2 px-2 pb-1">{extensionError}</p>
              )}

              {/* EVM wallet */}
              <div className="my-1 mt-2" style={{ borderTop: "1px solid var(--border-1)" }} />
              <div className="px-2 py-1 mb-1">
                <p className="text-[10px] uppercase tracking-wider text-c3">EVM</p>
              </div>
              {evmAddress ? (
                <>
                  <div className="flex items-center gap-2.5 px-2 py-2">
                    <WalletAvatar address={evmAddress} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-c1 truncate">{evmWalletName ?? "EVM Wallet"}</div>
                      <div className="text-[10px] font-mono text-c3">{truncateAddress(evmAddress, 6, 4)}</div>
                    </div>
                    <CheckCircle2 size={14} className="text-accent shrink-0" />
                  </div>
                  <button
                    type="button"
                    onClick={() => { disconnectEvmWallet(); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-c2 hover:text-c1 hover:bg-white/[0.04] transition"
                  >
                    <LogOut size={13} /> Disconnect EVM
                  </button>
                </>
              ) : (
                <>
                  <EvmConnectOptions onConnect={handleConnectEvm} loading={loadingEvm} />
                  {evmError && <p className="text-[10px] text-c2 px-2 pb-1">{evmError}</p>}
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One button per installed EVM wallet (EIP-6963), or a generic one */
function EvmConnectOptions({ onConnect, loading }: { onConnect: (rdns?: string) => void; loading: boolean }) {
  const [wallets, setWallets] = useState<DiscoveredWallet[]>([]);
  useEffect(() => {
    let alive = true;
    import("@/lib/evm/wallet").then(({ discoverEvmWallets }) =>
      discoverEvmWallets().then((w) => alive && setWallets(w))
    );
    return () => {
      alive = false;
    };
  }, []);

  const cls = "w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-c2 hover:text-c1 hover:bg-white/[0.04] transition";
  if (wallets.length === 0) {
    return (
      <button type="button" onClick={() => onConnect()} disabled={loading} className={cls}>
        {loading ? <RefreshCw size={13} className="spin-anim" /> : <Wallet size={13} />}
        Connect MetaMask / Rabby
      </button>
    );
  }
  return (
    <>
      {wallets.map((w) => (
        <button key={w.rdns} type="button" onClick={() => onConnect(w.rdns)} disabled={loading} className={cls}>
          {/* eslint-disable-next-line @next/next/no-img-element -- wallet icons are data: URIs announced by the extension */}
          <img src={w.icon} alt="" width={14} height={14} className="rounded-sm" />
          Connect {w.name}
        </button>
      ))}
    </>
  );
}

function isMobile(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** On phones without an injected wallet, open Vynera inside a wallet app's browser */
function MobileWalletLinks() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const w = window as Window & { ethereum?: unknown; injectedWeb3?: Record<string, unknown> };
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(isMobile() && !w.ethereum && !Object.keys(w.injectedWeb3 ?? {}).length);
  }, []);
  if (!show) return null;

  const url = window.location.href;
  const links = [
    { name: "SubWallet", href: `https://mobile.subwallet.app/browser?url=${encodeURIComponent(url)}` },
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, "")}` },
  ];
  return (
    <>
      <div className="my-1 mt-2" style={{ borderTop: "1px solid var(--border-1)" }} />
      <div className="px-2 py-1 mb-1">
        <p className="text-[10px] uppercase tracking-wider text-c3 flex items-center gap-1">
          <Smartphone size={10} aria-hidden="true" /> Open in a wallet app
        </p>
      </div>
      {links.map((l) => (
        <a
          key={l.name}
          href={l.href}
          rel="noopener noreferrer"
          className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-c2 hover:text-c1 hover:bg-white/[0.04] transition"
        >
          <ExternalLink size={13} /> {l.name}
        </a>
      ))}
    </>
  );
}

function ConnectSection({
  onConnectSubstrate, onConnectEvm, loadingSubstrate, loadingEvm, extensionError, evmError,
}: {
  onConnectSubstrate: () => void;
  onConnectEvm: (rdns?: string) => void;
  loadingSubstrate: boolean;
  loadingEvm: boolean;
  extensionError: string | null;
  evmError: string | null;
}) {
  return (
    <>
      <div className="px-2 py-1 mb-1">
        <p className="text-[10px] uppercase tracking-wider text-c3">Substrate</p>
      </div>
      <button
        type="button"
        onClick={onConnectSubstrate}
        disabled={loadingSubstrate}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-xs text-c2 hover:text-c1 hover:bg-white/[0.04] transition"
      >
        {loadingSubstrate ? <RefreshCw size={13} className="spin-anim" /> : <Wallet size={13} />}
        Connect SubWallet / Talisman
      </button>
      {extensionError && <p className="text-[10px] text-c2 px-2 pb-1">{extensionError}</p>}

      <div className="my-1 mt-2" style={{ borderTop: "1px solid var(--border-1)" }} />

      <div className="px-2 py-1 mb-1">
        <p className="text-[10px] uppercase tracking-wider text-c3">EVM</p>
      </div>
      <EvmConnectOptions onConnect={onConnectEvm} loading={loadingEvm} />
      {evmError && <p className="text-[10px] text-c2 px-2 pb-1">{evmError}</p>}
      <MobileWalletLinks />
    </>
  );
}

function AccountRow({ account, isSelected, onSelect }: {
  account: WalletAccount;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/[0.04] transition"
    >
      <WalletAvatar address={account.address} />
      <div className="flex-1 text-left min-w-0">
        <div className="text-xs font-medium text-c1 truncate">{account.name}</div>
        <div className="text-[10px] font-mono text-c3">{truncateAddress(toAutonomysAddress(account.address), 6, 4)}</div>
      </div>
      {isSelected && <CheckCircle2 size={14} className="text-accent shrink-0" />}
    </button>
  );
}

function WalletAvatar({ address }: { address: string }) {
  const hue = address ? [...address].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360 : 270;
  return (
    <span
      className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
      style={{
        background: `radial-gradient(circle at 30% 30%, hsl(${hue},80%,70%), hsl(${hue},70%,45%) 60%, hsl(${hue - 40},80%,35%))`,
      }}
    />
  );
}
