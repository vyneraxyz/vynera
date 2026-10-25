"use client";

import { AnimatePresence } from "framer-motion";
import { AlertCircle, CheckCircle2, ChevronRight, Gift, Moon, PenLine, Search, Shield, Sun } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RouteSelector } from "@/components/bridge/DirectionToggle";
import { AmountInput } from "@/components/bridge/AmountInput";
import { RecipientInput } from "@/components/bridge/RecipientInput";
import { ReviewDialog } from "@/components/bridge/ReviewDialog";
import { SenderBlock } from "@/components/bridge/SenderBlock";
import { SigningModal, Spinner, StatusTimeline, txLegs } from "@/components/bridge/StatusTimeline";
import { SummaryCard } from "@/components/bridge/SummaryCard";
import { useWalletActions } from "@/components/wallet/useWalletActions";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { WalletProvider } from "@/components/wallet/WalletProvider";
import { recipientNotice, toAutonomysAddress, truncateAddress, validateRecipient } from "@/lib/autonomys/addresses";
import { computeMax, formatAI3, parseAI3 } from "@/lib/autonomys/amounts";
import { MIN_TRANSFER_SHANNONS, TREASURY_SS58 } from "@/lib/constants";
import { REFERRAL_SHARE_PCT } from "@/lib/fees";
import { getWai3Balance } from "@/lib/hyperlane";
import { captureReferralFromUrl, getReferrer, referralLink } from "@/lib/referral";
import { CHAIN_LABEL, CHAIN_TOKEN, legSigner, planRoute } from "@/lib/routes";
import { createTransfer, legExplorerUrl, nextLegToSign, runLeg, watchTick } from "@/lib/transfer/engine";
import { quoteRoute } from "@/lib/transfer/quote";
import { useTxStore } from "@/store/transactions";
import { useWalletStore } from "@/store/wallet";
import type { Chain, StoredTx } from "@/types";

type Overlay = "review" | "signing" | "status" | null;

const WATCH_INTERVAL_MS = 30_000;

export default function BridgePage() {
  return (
    <WalletProvider>
      <BridgeApp />
    </WalletProvider>
  );
}

function BridgeApp() {
  const { connected, selectedAddress, balanceShannons, balanceLoading, theme, evmAddress, evmBalanceShannons, evmBalanceLoading } =
    useWalletStore();
  const { fetchBalance, fetchEvmBalance, loadAccountsFromExtension, connectEvm } = useWalletActions();
  const { setTheme } = useWalletStore();
  const { activeTx, history: txHistory, setActiveTx, activate } = useTxStore();

  const [from, setFrom] = useState<Chain>("consensus");
  const [to, setTo] = useState<Chain>("evm");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [wai3Balance, setWai3Balance] = useState(0n);
  const [wai3Loading, setWai3Loading] = useState(false);
  const [referrer, setReferrer] = useState<string | null>(null);

  const legs = useMemo(() => planRoute(from, to), [from, to]);
  const firstSigner = legs[0] ? legSigner(legs[0].kind) : "substrate";
  const needsEvm = legs.some((l) => legSigner(l.kind) === "evm") || legs.length > 1;

  // Sender is whoever signs the first leg
  const fromAddress = firstSigner === "substrate" ? selectedAddress : evmAddress;
  const walletConnected = !!fromAddress && (!needsEvm || !!evmAddress);
  const effectiveBalance = from === "consensus" ? balanceShannons : from === "evm" ? evmBalanceShannons : wai3Balance;

  // Referral from ?ref= — read after mount (localStorage)
  useEffect(() => {
    captureReferralFromUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReferrer(getReferrer(selectedAddress));
  }, [selectedAddress]);

  useEffect(() => {
    if (connected && selectedAddress) fetchBalance();
  }, [connected, selectedAddress, fetchBalance]);

  const fetchWai3 = useCallback(async () => {
    if (!evmAddress) return;
    setWai3Loading(true);
    try {
      setWai3Balance(await getWai3Balance(evmAddress));
    } catch (err: unknown) {
      console.error("Failed to fetch WAI3 balance:", err);
    } finally {
      setWai3Loading(false);
    }
  }, [evmAddress]);

  useEffect(() => {
    if (!evmAddress) return;
    if (from === "evm") fetchEvmBalance();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (from === "ethereum") fetchWai3();
    const id = setInterval(() => (from === "ethereum" ? fetchWai3() : fetchEvmBalance()), 30_000);
    return () => clearInterval(id);
  }, [from, evmAddress, fetchEvmBalance, fetchWai3]);

  // Follow every unfinished transfer (active and history) to its destination
  useEffect(() => {
    watchTick();
    const id = setInterval(watchTick, WATCH_INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && watchTick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // On mount: reopen the status dialog for a persisted active transfer
  useEffect(() => {
    const tx = useTxStore.getState().activeTx;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tx && tx.phase !== "idle") setOverlay("status");
  }, []);

  // Leave the signing modal once the wallet has answered
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (overlay === "signing" && activeTx && activeTx.phase !== "signing") setOverlay("status");
  }, [overlay, activeTx]);

  // Derived validation
  const recipientValidation = validateRecipient(recipient, to);
  const notice = recipientNotice(recipient, to, {
    treasurySS58: TREASURY_SS58,
    ownAddress: to === "consensus" ? selectedAddress : evmAddress,
  });
  const parsedAmount = parseAI3(amount);
  const quote = parsedAmount !== null ? quoteRoute(from, to, parsedAmount, referrer) : null;
  const sourceGas = quote?.sourceGas ?? (from === "ethereum" ? 0n : undefined) ?? 0n;
  const insufficient = parsedAmount !== null && parsedAmount > 0n && parsedAmount + sourceGas > effectiveBalance;

  const formReady =
    walletConnected &&
    recipientValidation.state === "valid" &&
    parsedAmount !== null &&
    parsedAmount >= MIN_TRANSFER_SHANNONS &&
    !insufficient &&
    !!quote &&
    quote.receives > 0n;

  const handleRoute = useCallback((f: Chain, t: Chain) => {
    setFrom(f);
    setTo(t);
    setRecipient(""); // address format may change
  }, []);

  const handlePreset = useCallback(
    (fraction: 0.25 | 0.5 | 1) => {
      const max = from === "ethereum" ? effectiveBalance : computeMax(effectiveBalance);
      const value = fraction === 1 ? max : (max * BigInt(fraction * 100)) / 100n;
      setAmount(formatAI3(value, 4));
    },
    [effectiveBalance, from]
  );

  const handleRefreshBalance = useCallback(() => {
    if (from === "consensus") fetchBalance();
    else if (from === "evm") fetchEvmBalance();
    else fetchWai3();
  }, [from, fetchBalance, fetchEvmBalance, fetchWai3]);

  const connectMissing = useCallback(() => {
    if (firstSigner === "substrate" && !selectedAddress) loadAccountsFromExtension(true);
    else connectEvm();
  }, [firstSigner, selectedAddress, loadAccountsFromExtension, connectEvm]);

  const handleConfirmReview = useCallback(async () => {
    if (!fromAddress || parsedAmount === null) return;
    let tx: StoredTx;
    try {
      tx = createTransfer({ from, to, sender: fromAddress, evmAddress, recipient: recipient.trim(), amount: parsedAmount, referrer });
    } catch (err: unknown) {
      console.error(err);
      return;
    }
    setActiveTx(tx);
    setOverlay("signing");
    await runLeg(tx.id, 0);
  }, [fromAddress, parsedAmount, from, to, evmAddress, recipient, referrer, setActiveTx]);

  const handleSignLeg = useCallback(
    async (txId: string, legIndex: number) => {
      activate(txId);
      setOverlay("signing");
      await runLeg(txId, legIndex);
    },
    [activate]
  );

  const openTx = useCallback(
    (txId: string) => {
      activate(txId);
      setOverlay("status");
    },
    [activate]
  );

  const handleSendAnother = useCallback(() => {
    setOverlay(null);
    setAmount("");
    setRecipient("");
    fetchBalance();
    if (evmAddress) fetchEvmBalance();
  }, [fetchBalance, fetchEvmBalance, evmAddress]);

  const handleCancelSigning = useCallback(() => {
    const tx = useTxStore.getState().activeTx;
    const i = tx?.legs?.findIndex((l) => l.phase === "signing") ?? -1;
    if (tx && i >= 0) useTxStore.getState().updateLeg(tx.id, i, { phase: i === 0 ? "error" : "pending", error: "Cancelled by user" });
    if (tx) useTxStore.getState().updateTx(tx.id, { phase: i > 0 ? "awaitingNextLeg" : "error", error: "Cancelled by user" });
    setOverlay(null);
  }, []);

  const awaiting = [activeTx, ...txHistory].filter(
    (t): t is StoredTx => !!t && t.phase === "awaitingNextLeg" && nextLegToSign(t) > 0
  );
  // Transfers stored before delivery tracking (no legs) can't be followed, so they don't count
  const inFlightCount = [activeTx, ...txHistory].filter(
    (t) => !!t?.legs && !["idle", "error", "executed", "delivered", "awaitingNextLeg"].includes(t.phase)
  ).length;

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
              <div className="text-c3 text-[11px]">Cross-chain AI3 transfers</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/track"
              className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center"
              aria-label="Track a transfer"
              title="Track a transfer"
            >
              <Search size={15} />
            </Link>
            <WalletConnect />
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="btn-ghost rounded-full w-8 h-8 flex items-center justify-center"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        </header>

        {/* Transfers waiting for the user's second signature */}
        {awaiting.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => openTx(t.id)}
            className="mb-3 w-full rounded-2xl px-4 py-3 flex items-center gap-2.5 text-left"
            style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}
          >
            <PenLine size={14} className="text-warning shrink-0" aria-hidden="true" />
            <span className="text-xs text-c1 flex-1">
              Step 1 arrived on {CHAIN_LABEL[txLegs(t)[0].to]} — sign step 2 to finish sending to {CHAIN_LABEL[t.to ?? "consensus"]}
            </span>
            <ChevronRight size={14} className="text-c2" />
          </button>
        ))}

        {/* Bridge card */}
        <main>
          <div className="surface rounded-3xl p-5 sm:p-6">
            <div className="mb-1.5 px-1">
              <h1 className="text-c1 text-base font-semibold tracking-tight">Transfer AI3</h1>
            </div>
            <p className="text-c2 text-[12.5px] mb-4 px-1 leading-snug">
              Move AI3 between Autonomys Consensus, Auto EVM and Ethereum.
            </p>

            <div className="grid gap-3">
              <RouteSelector from={from} to={to} onChange={handleRoute} />

              <SenderBlock
                chain={from}
                address={fromAddress}
                balanceShannons={effectiveBalance}
                onRefresh={handleRefreshBalance}
                refreshing={from === "consensus" ? balanceLoading : from === "evm" ? evmBalanceLoading : wai3Loading}
                disabled={!walletConnected}
              />

              <RecipientInput
                value={recipient}
                onChange={setRecipient}
                targetChain={to}
                notice={notice}
                disabled={!walletConnected}
              />

              <AmountInput
                value={amount}
                onChange={setAmount}
                balanceShannons={effectiveBalance}
                onPreset={handlePreset}
                gasShannons={sourceGas}
                token={CHAIN_TOKEN[from]}
                disabled={!walletConnected}
              />

              <SummaryCard
                from={from}
                to={to}
                quote={quote}
                expanded={summaryExpanded}
                onToggle={() => setSummaryExpanded((e) => !e)}
                disabled={!walletConnected}
              />

              {walletConnected ? (
                <button
                  type="button"
                  onClick={() => setOverlay("review")}
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
                  onClick={connectMissing}
                  className="btn-accent rounded-2xl w-full text-white font-medium flex items-center justify-center gap-2"
                  style={{ height: 52, fontSize: 15 }}
                >
                  <WalletIcon />
                  {fromAddress && needsEvm && !evmAddress ? "Connect EVM wallet too" : "Connect Wallet"}
                </button>
              )}
              {fromAddress && needsEvm && !evmAddress && legs.length > 1 && (
                <p className="text-[11.5px] text-c3 -mt-1 px-1">
                  This route goes through Auto EVM, so step 2 is signed with an EVM wallet.
                </p>
              )}
            </div>
          </div>
        </main>

        {/* In-progress indicator */}
        {inFlightCount > 0 && overlay !== "status" && (
          <button
            type="button"
            onClick={() => (activeTx ? setOverlay("status") : document.getElementById("recent-transfers")?.scrollIntoView({ behavior: "smooth" }))}
            className="mt-3 w-full surface rounded-2xl px-4 py-3 flex items-center gap-2.5 btn-ghost text-left"
          >
            <span className="text-accent shrink-0">
              <Spinner size={12} />
            </span>
            <span className="text-xs text-c2 flex-1">
              {inFlightCount === 1 ? "Transfer in progress" : `${inFlightCount} transfers in progress`}
            </span>
            <span className="text-xs text-accent">View →</span>
          </button>
        )}

        {selectedAddress && <ReferralCard address={selectedAddress} referrer={referrer} />}

        {/* Footer */}
        <footer className="mt-4 flex items-center justify-between px-1">
          <span className="text-[11px] text-c3 flex items-center gap-1.5">
            <Shield size={11} aria-hidden="true" />
            Independent · Verifies every transaction before signing
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
        {txHistory.length > 0 && <TxHistorySection history={txHistory} onOpen={openTx} />}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {overlay === "review" && fromAddress && quote && (
          <ReviewDialog
            key="review"
            from={from}
            to={to}
            quote={quote}
            fromAddress={fromAddress}
            toAddress={recipient.trim()}
            recipientNotice={notice}
            onConfirm={handleConfirmReview}
            onClose={() => setOverlay(null)}
          />
        )}
        {overlay === "signing" && <SigningModal key="signing" onCancel={handleCancelSigning} />}
        {overlay === "status" && (
          <StatusTimeline
            key="status"
            onClose={() => setOverlay(null)}
            onSendAnother={handleSendAnother}
            onSignLeg={handleSignLeg}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Referral card ───────────────────────────────────────────────────────────

function ReferralCard({ address, referrer }: { address: string; referrer: string | null }) {
  const [copied, setCopied] = useState(false);
  const link = referralLink(address);
  return (
    <div className="mt-3 surface rounded-2xl px-4 py-3">
      <div className="flex items-center gap-2.5">
        <Gift size={14} className="text-accent shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-c1">Invite friends — earn {REFERRAL_SHARE_PCT.toString()}% of their platform fees</div>
          <div className="text-[11px] text-c3 font-mono truncate">{link}</div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // clipboard unavailable
            }
          }}
          className="btn-ghost rounded-lg px-2.5 py-1.5 text-[11px] shrink-0"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
      {referrer && (
        <div className="text-[11px] text-c3 mt-1.5 ml-[22px]">
          You were invited by {truncateAddress(toAutonomysAddress(referrer), 6, 4)} — part of your fee goes to them, you pay the same.
        </div>
      )}
    </div>
  );
}

// ─── Transaction history ──────────────────────────────────────────────────────

function TxHistorySection({ history, onOpen }: { history: StoredTx[]; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? history : history.slice(0, 3);

  return (
    <div className="mt-3" id="recent-transfers">
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
      <div className="surface rounded-2xl overflow-hidden divide-y" style={{ borderColor: "var(--border-1)" }}>
        {shown.map((tx) => (
          <TxHistoryItem key={tx.id} tx={tx} onOpen={() => onOpen(tx.id)} />
        ))}
      </div>
    </div>
  );
}

const SHORT: Record<Chain, string> = { consensus: "CON", evm: "EVM", ethereum: "ETH" };

function TxHistoryItem({ tx, onOpen }: { tx: StoredTx; onOpen: () => void }) {
  const legs = txLegs(tx);
  const from = tx.from ?? legs[0].from;
  const to = tx.to ?? legs[legs.length - 1].to;
  const d = new Date(tx.createdAt);
  const dateStr = d.toLocaleDateString("en", { month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  const url = legExplorerUrl(legs[0]);

  const status =
    tx.phase === "error" ? (
      <span className="flex items-center gap-1 text-[11px] text-c3">
        <AlertCircle size={13} aria-hidden="true" /> Failed
      </span>
    ) : tx.phase === "delivered" || tx.phase === "executed" ? (
      <span className="flex items-center gap-1 text-[11px] text-accent">
        <CheckCircle2 size={13} aria-hidden="true" /> Delivered
      </span>
    ) : tx.phase === "awaitingNextLeg" ? (
      <span className="flex items-center gap-1 text-[11px] text-warning">
        <PenLine size={13} aria-hidden="true" /> Sign step 2
      </span>
    ) : legs.every((l) => l.phase === "inFlight" || l.phase === "delivered") && !tx.legs ? (
      // Stored before delivery tracking existed — we only know it left the source chain
      <span className="flex items-center gap-1 text-[11px] text-c3">
        <CheckCircle2 size={13} aria-hidden="true" /> Sent
      </span>
    ) : (
      <span className="flex items-center gap-1 text-[11px] text-c2">
        <Spinner size={12} /> In flight
      </span>
    );

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <button type="button" onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <span
          className="text-[10px] font-medium px-1.5 py-0.5 rounded-md shrink-0"
          style={{ background: "rgba(110,58,255,0.12)", color: "#8A5DFF" }}
        >
          {SHORT[from]}→{SHORT[to]}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-c1 font-medium leading-tight">
            {formatAI3(BigInt(tx.amount), 4)} <span className="text-c3 text-xs font-normal">{CHAIN_TOKEN[from]}</span>
          </div>
          <div className="text-[11px] text-c3 leading-tight">
            {dateStr} · {timeStr}
          </div>
        </div>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        {status}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost rounded-md p-0.5" aria-label="View on explorer">
            <ExternalLinkIcon />
          </a>
        )}
      </div>
    </div>
  );
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-c3" aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 17.5v-10z" />
      <path d="M21 11h-4a2 2 0 1 0 0 4h4" />
    </svg>
  );
}
