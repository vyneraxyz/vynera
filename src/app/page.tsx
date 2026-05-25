"use client";

import { AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, ExternalLink, Moon, Shield, Sun } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AmountInput } from "@/components/bridge/AmountInput";
import { DirectionToggle } from "@/components/bridge/DirectionToggle";
import { RecipientInput } from "@/components/bridge/RecipientInput";
import { ReviewDialog } from "@/components/bridge/ReviewDialog";
import { SenderBlock } from "@/components/bridge/SenderBlock";
import { SigningModal, StatusTimeline } from "@/components/bridge/StatusTimeline";
import { SummaryCard } from "@/components/bridge/SummaryCard";
import { useWalletActions } from "@/components/wallet/useWalletActions";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { validateRecipient } from "@/lib/autonomys/addresses";
import {
  computeMax,
  formatAI3,
  isInsufficient,
  parseAI3,
} from "@/lib/autonomys/amounts";
import { buildAndSendXdm, buildAndSendXdmEvm } from "@/lib/autonomys/xdm";
import { BLOCK_TIME_SECONDS, CHAINS, challengeBlocks, MIN_TRANSFER_SHANNONS, PLATFORM_FEE_BPS, TREASURY_SS58 } from "@/lib/constants";
import { useTxStore } from "@/store/transactions";
import { useWalletStore } from "@/store/wallet";
import type { Direction, NetworkName, StoredTx } from "@/types";

type Overlay = "review" | "signing" | "status" | null;

export default function BridgePage() {
  return (
    <WalletProvider>
      <BridgeApp />
    </WalletProvider>
  );
}

function BridgeApp() {
  const { connected, selectedAddress, balanceShannons, balanceLoading, network, theme, evmAddress, evmBalanceShannons, evmBalanceLoading } =
    useWalletStore();
  const { fetchBalance, fetchEvmBalance, loadAccountsFromExtension, connectEvm } = useWalletActions();
  const { setTheme, setNetwork } = useWalletStore();
  const { activeTx, history: txHistory, setActiveTx, updateActiveTxPhase } = useTxStore();

  const [direction, setDirection] = useState<Direction>("c2e");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);

  const fromChain = direction === "c2e" ? "consensus" : "evm";
  const toChain = direction === "c2e" ? "evm" : "consensus";

  // Direction-aware sender: EVM address for e2c, substrate for c2e
  const fromAddress = direction === "e2c" ? evmAddress : selectedAddress;
  const useEvmSigner = direction === "e2c" && !!evmAddress;
  const walletConnected = direction === "e2c" ? !!evmAddress : connected;
  const effectiveBalance = direction === "e2c" ? evmBalanceShannons : balanceShannons;

  // Fetch balance when address/network changes
  useEffect(() => {
    if (connected && selectedAddress) fetchBalance();
  }, [connected, selectedAddress, fetchBalance]);

  // Fetch EVM balance when switching to e2c or EVM address changes
  useEffect(() => {
    if (direction === "e2c" && evmAddress) fetchEvmBalance();
  }, [direction, evmAddress, fetchEvmBalance]);

  // Auto-refresh EVM balance every 30 s while viewing e2c direction
  useEffect(() => {
    if (direction !== "e2c" || !evmAddress) return;
    const id = setInterval(fetchEvmBalance, 30_000);
    return () => clearInterval(id);
  }, [direction, evmAddress, fetchEvmBalance]);

  // On mount: open status overlay if there is a persisted active tx in localStorage.
  useEffect(() => {
    const unsub = useTxStore.subscribe((state) => {
      const tx = state.activeTx;
      if (tx && tx.phase !== "idle") {
        setOverlay("status");
        unsub();
      }
    });
    return unsub;
  }, []);

  // Auto-reopen status overlay when background monitoring completes the transfer.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (activeTx?.phase === "executed") setOverlay("status");
  }, [activeTx]);

  // ── Persistent tx monitoring (survives overlay close) ────────────────────────

  const txRef = useRef(activeTx);
  useEffect(() => { txRef.current = activeTx; });
  const monitorUnsubRef = useRef<(() => void) | null>(null);

  // Block subscription: advances finalized → challenge and tracks progress blocks.
  useEffect(() => {
    let cancelled = false;
    monitorUnsubRef.current?.();
    monitorUnsubRef.current = null;

    const subscribe = async () => {
      try {
        const { getApi } = await import("@/lib/autonomys/api");
        const direction = txRef.current?.direction ?? "c2e";
        const rpc =
          direction === "c2e"
            ? CHAINS[network].consensus.rpc
            : CHAINS[network].evm.rpc;
        const api = await getApi(rpc);

        const unsub = await api.rpc.chain.subscribeFinalizedHeads((header) => {
          if (cancelled) return;
          const tx = txRef.current;
          if (!tx) return;
          const phase = tx.phase;
          if (phase !== "finalized" && phase !== "challenge") return;

          const period = challengeBlocks(tx.direction);
          const blockNum = header.number.toNumber();

          if (phase === "finalized" || tx.challengeStartBlock === undefined) {
            updateActiveTxPhase("challenge", {
              challengeStartBlock: blockNum,
              challengeCurrentBlock: blockNum,
              challengeStartTime: tx.challengeStartTime ?? Date.now(),
            });
          } else {
            const elapsed = blockNum - tx.challengeStartBlock;
            updateActiveTxPhase("challenge", { challengeCurrentBlock: blockNum });

            if (elapsed >= period) {
              unsub();
              updateActiveTxPhase("relayed");
              setTimeout(() => {
                if (!cancelled) updateActiveTxPhase("executed");
              }, 6000);
            }
          }
        });

        monitorUnsubRef.current = unsub;
      } catch (err) {
        console.error("Block subscription error:", err);
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      monitorUnsubRef.current?.();
      monitorUnsubRef.current = null;
    };
  }, [network, updateActiveTxPhase]);

  // Fallback A: advance inBlock/finalized → challenge after 90 s.
  useEffect(() => {
    if (!activeTx) return;
    const { id, phase, createdAt } = activeTx;
    if (phase !== "inBlock" && phase !== "finalized") return;

    const remaining = Math.max(0, createdAt + 90_000 - Date.now());
    const timer = setTimeout(() => {
      const current = useTxStore.getState().activeTx;
      if (!current || current.id !== id) return;
      if (current.phase !== "inBlock" && current.phase !== "finalized") return;
      updateActiveTxPhase("challenge", { challengeStartTime: Date.now() });
    }, remaining);
    return () => clearTimeout(timer);
  }, [activeTx, updateActiveTxPhase]);

  // Fallback B: advance challenge → relayed → executed when period elapses.
  useEffect(() => {
    if (!activeTx || activeTx.phase !== "challenge") return;
    const { id, direction, createdAt } = activeTx;

    const challengeMs = challengeBlocks(direction) * BLOCK_TIME_SECONDS * 1000;
    const remaining = Math.max(0, createdAt + 90_000 + challengeMs - Date.now());
    const timer = setTimeout(() => {
      const current = useTxStore.getState().activeTx;
      if (!current || current.id !== id) return;
      if (current.phase === "executed" || current.phase === "error") return;
      updateActiveTxPhase("relayed");
      setTimeout(() => {
        const p = useTxStore.getState().activeTx;
        if (!p || p.id !== id || p.phase === "executed" || p.phase === "error") return;
        updateActiveTxPhase("executed");
      }, 2000);
    }, remaining);
    return () => clearTimeout(timer);
  }, [activeTx, updateActiveTxPhase]);

  // Derived validation
  const recipientValidation = validateRecipient(recipient, toChain);
  const parsedAmount = parseAI3(amount);
  const insufficient = isInsufficient(parsedAmount, effectiveBalance);

  const formReady =
    !!fromAddress &&
    recipientValidation.state === "valid" &&
    parsedAmount !== null &&
    parsedAmount >= MIN_TRANSFER_SHANNONS &&
    !insufficient;

  const handleSwap = useCallback((next: Direction) => {
    setDirection(next);
    setRecipient(""); // clear recipient — validation flips
  }, []);

  const handleMax = useCallback(() => {
    const max = computeMax(effectiveBalance);
    setAmount(formatAI3(max, 4));
  }, [effectiveBalance]);

  const handleRefreshBalance = useCallback(() => {
    if (direction === "e2c" && evmAddress) {
      fetchEvmBalance();
    } else {
      fetchBalance();
    }
  }, [direction, evmAddress, fetchBalance, fetchEvmBalance]);

  const openReview = useCallback(() => setOverlay("review"), []);
  const closeReview = useCallback(() => setOverlay(null), []);

  const handleConfirmReview = useCallback(async () => {
    if (!fromAddress || parsedAmount === null) return;

    const chainConfig = CHAINS[network];
    const domainId = chainConfig.evm.domainId;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setActiveTx({
      id,
      hash: "",
      direction,
      fromAddress,
      toAddress: recipient,
      amount: parsedAmount.toString(),
      network,
      phase: "signing",
      createdAt: Date.now(),
    });

    setOverlay("signing");

    const xdmParams = {
      direction,
      fromAddress,
      toAddress: recipient,
      amountShannons: parsedAmount,
      domainId,
      evmChainId: chainConfig.evm.chainId,
      platformFeeBps: direction === "c2e" ? PLATFORM_FEE_BPS : undefined,
      treasurySS58: TREASURY_SS58 || undefined,
      onPhaseChange: (phase: Parameters<typeof updateActiveTxPhase>[0], blockHash?: string) => {
        updateActiveTxPhase(phase, blockHash ? { hash: blockHash } : undefined);
        if (phase === "inBlock" || phase === "finalized" || phase === "challenge") {
          setOverlay("status");
        }
      },
      onError: (message: string) => {
        updateActiveTxPhase("error", { error: message });
        setOverlay("status");
        console.error("XDM transfer error:", message);
      },
    };

    try {
      const { getApi } = await import("@/lib/autonomys/api");
      const rpc = direction === "c2e" ? chainConfig.consensus.rpc : chainConfig.evm.rpc;
      const api = await getApi(rpc);

      if (useEvmSigner) {
        await buildAndSendXdmEvm({ api, ...xdmParams });
      } else {
        await buildAndSendXdm({ api, ...xdmParams });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unexpected error";
      updateActiveTxPhase("error", { error: msg });
      setOverlay("status");
      console.error("Unexpected XDM error:", err);
    }
  }, [
    fromAddress,
    useEvmSigner,
    parsedAmount,
    direction,
    recipient,
    network,
    setActiveTx,
    updateActiveTxPhase,
  ]);

  const handleSendAnother = useCallback(() => {
    setOverlay(null);
    setAmount("");
    setRecipient("");
    fetchBalance();
    if (evmAddress) fetchEvmBalance();
  }, [fetchBalance, fetchEvmBalance, evmAddress]);

  const handleCancelSigning = useCallback(() => {
    updateActiveTxPhase("error", { error: "Cancelled by user" });
    setOverlay(null);
  }, [updateActiveTxPhase]);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8 sm:py-14 relative z-10">
      <div className="mesh-bg" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="w-full max-w-[520px]">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 mb-5 px-1">
          <div className="flex items-center gap-3">
            <div>
              <Image
                src={theme === "dark" ? "/vynera_logo_white.png" : "/vynera_logo_black.png"}
                alt="Vynera"
                width={152}
                height={36}
                style={{ display: "block" }}
              />
              <div className="text-c3 text-[11px]">Cross-domain transfers</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NetworkPill
              network={network}
              onToggle={() =>
                setNetwork(network === "Mainnet" ? "Testnet" : "Mainnet")
              }
            />
            <WalletConnect />
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center"
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        {/* Bridge card */}
        <main>
          <div className="surface rounded-3xl p-5 sm:p-6">
            <div className="mb-1.5 px-1">
              <h1 className="text-c1 text-base font-semibold tracking-tight">
                Transfer AI3
              </h1>
            </div>
            <p className="text-c2 text-[12.5px] mb-4 px-1 leading-snug">
              Move tokens between the Consensus chain and Auto EVM domain.
            </p>

            <div className="grid gap-3">
              <DirectionToggle direction={direction} onChange={handleSwap} />

              <SenderBlock
                chain={fromChain}
                address={fromAddress}
                balanceShannons={effectiveBalance}
                onRefresh={handleRefreshBalance}
                refreshing={direction === "e2c" ? evmBalanceLoading : balanceLoading}
                disabled={!walletConnected}
              />

              <RecipientInput
                value={recipient}
                onChange={setRecipient}
                targetChain={toChain}
                disabled={!walletConnected}
              />

              <AmountInput
                value={amount}
                onChange={setAmount}
                balanceShannons={effectiveBalance}
                onMax={handleMax}
                disabled={!walletConnected}
              />

              <SummaryCard
                amount={amount}
                direction={direction}
                expanded={summaryExpanded}
                onToggle={() => setSummaryExpanded((e) => !e)}
                disabled={!walletConnected}
              />

              {walletConnected ? (
                <button
                  type="button"
                  onClick={openReview}
                  disabled={!formReady}
                  className="btn-accent rounded-2xl w-full text-white font-medium flex items-center justify-center gap-2"
                  style={{ height: 52, fontSize: 15 }}
                  aria-label="Review and sign transfer"
                >
                  Review &amp; Sign
                  <ArrowRightIcon />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (direction === "e2c") connectEvm();
                    else loadAccountsFromExtension(true);
                  }}
                  className="btn-accent rounded-2xl w-full text-white font-medium flex items-center justify-center gap-2"
                  style={{ height: 52, fontSize: 15 }}
                >
                  <WalletIcon />
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </main>

        {/* In-progress indicator — lets user reopen the dialog while tx runs in background */}
        {activeTx &&
          !["idle", "error", "executed"].includes(activeTx.phase) &&
          overlay !== "status" && (
            <button
              type="button"
              onClick={() => setOverlay("status")}
              className="mt-3 w-full surface rounded-2xl px-4 py-3 flex items-center gap-2.5 btn-ghost text-left"
            >
              <svg
                width={12}
                height={12}
                viewBox="0 0 24 24"
                fill="none"
                className="spin-anim text-accent shrink-0"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" />
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span className="text-xs text-c2 flex-1">Transfer in progress</span>
              <span className="text-xs text-accent">View →</span>
            </button>
          )}

        {/* Footer */}
        <footer className="mt-4 flex items-center justify-between px-1">
          <span className="text-[11px] text-c3 flex items-center gap-1.5">
            <Shield size={11} aria-hidden="true" />
            Independent · Verifies addresses before signing
          </span>
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/vyneraxyz"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="opacity-50 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/icons8-github-logo.svg"
                alt="GitHub"
                width={22}
                height={22}
                style={{ filter: theme === "dark" ? "invert(1)" : "none" }}
              />
            </a>
            <a
              href="https://x.com/vynera_xyz"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X / Twitter"
              className="opacity-50 hover:opacity-80 transition-opacity"
            >
              <Image
                src="/x--logo--black-100.png"
                alt="X"
                width={19}
                height={19}
                style={{ filter: theme === "dark" ? "invert(1)" : "none" }}
              />
            </a>
          </div>
        </footer>

        {/* Transaction history */}
        {txHistory.length > 0 && <TxHistorySection history={txHistory} />}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {overlay === "review" && fromAddress && (
          <ReviewDialog
            key="review"
            direction={direction}
            amount={amount}
            fromAddress={fromAddress}
            toAddress={recipient}
            platformFeeEnabled={direction === "c2e"}
            onConfirm={handleConfirmReview}
            onClose={closeReview}
          />
        )}
        {overlay === "signing" && (
          <SigningModal key="signing" onCancel={handleCancelSigning} />
        )}
        {overlay === "status" && (
          <StatusTimeline
            key="status"
            onClose={() => setOverlay(null)}
            onSendAnother={handleSendAnother}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Transaction history ──────────────────────────────────────────────────────

function TxHistorySection({ history }: { history: StoredTx[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? history : history.slice(0, 3);

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between px-1 mb-2">
        <span className="text-[11px] uppercase tracking-wider text-c3">Recent transfers</span>
        {history.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-[11px] text-accent btn-ghost px-1 py-0.5 rounded"
          >
            {expanded ? "Show less" : `+${history.length - 3} more`}
          </button>
        )}
      </div>
      <div
        className="surface rounded-2xl overflow-hidden divide-y"
        style={{ borderColor: "var(--border-1)" }}
      >
        {shown.map((tx) => (
          <TxHistoryItem key={tx.id} tx={tx} />
        ))}
      </div>
    </div>
  );
}

function TxHistoryItem({ tx }: { tx: StoredTx }) {
  const explorerUrl = tx.hash
    ? tx.direction === "c2e"
      ? `${CHAINS[tx.network].consensus.explorerBase}/extrinsics/${tx.hash}`
      : `${CHAINS[tx.network].evm.explorerBase}/tx/${tx.hash}`
    : null;

  const isError = tx.phase === "error";
  const d = new Date(tx.createdAt);
  const dateStr = d.toLocaleDateString("en", { month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span
        className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0"
        style={{ background: "rgba(110,58,255,0.12)", color: "#8A5DFF" }}
      >
        {tx.direction === "c2e" ? "CON→EVM" : "EVM→CON"}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-c1 font-medium leading-tight">
          {formatAI3(BigInt(tx.amount), 4)}{" "}
          <span className="text-c3 text-xs font-normal">AI3</span>
        </div>
        <div className="text-[11px] text-c3 leading-tight">
          {dateStr} · {timeStr}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {isError ? (
          <AlertCircle size={13} className="text-c3" aria-label="Failed" />
        ) : (
          <CheckCircle2 size={13} className="text-accent" aria-label="Complete" />
        )}
        {explorerUrl && (
          <button
            type="button"
            onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
            className="btn-ghost rounded-md p-0.5"
            aria-label="View on explorer"
          >
            <ExternalLink size={12} className="text-c3" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────


function NetworkPill({
  network,
  onToggle,
}: {
  network: NetworkName;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="hairline-2 rounded-full pl-2 pr-3 py-1 flex items-center gap-2 text-xs btn-ghost"
      aria-label={`Network: ${network}. Click to switch.`}
    >
      <span
        className="relative flex items-center justify-center"
        style={{ width: 8, height: 8 }}
        aria-hidden="true"
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: "#6E3AFF" }}
        />
        <span
          className="absolute -inset-1 rounded-full pulse-soft"
          style={{ background: "#6E3AFF", opacity: 0.25 }}
        />
      </span>
      <span className="text-c2">{network}</span>
    </button>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 17.5v-10z" />
      <path d="M21 11h-4a2 2 0 1 0 0 4h4" />
    </svg>
  );
}
