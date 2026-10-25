import type { ApiPromise } from "@autonomys/auto-utils";
import { createConnection } from "@autonomys/auto-utils";
import { samePublicKey } from "@/lib/autonomys/addresses";
import { CHAINS, TREASURY_SS58 } from "@/lib/constants";

// Server-only data for the treasury dashboard. Balance comes from the chain;
// fee history needs SUBSCAN_API_KEY (Subscan lists incoming transfers) and
// every entry is re-checked on-chain to tell Vynera platform fees apart from
// other deposits.

const SUBSCAN = "https://autonomys.api.subscan.io";
const MAX_PAGES = 5; // 500 most recent incoming transfers
export const DAY = 86_400_000;

let apiPromise: Promise<ApiPromise> | null = null;
export function consensusApi(): Promise<ApiPromise> {
  apiPromise ??= createConnection(CHAINS.Mainnet.consensus.rpc)
    .then((api) => {
      if (api.genesisHash.toHex() !== CHAINS.Mainnet.consensus.genesisHash) throw new Error("Unexpected chain");
      return api;
    })
    .catch((err) => {
      apiPromise = null;
      throw err;
    });
  return apiPromise;
}

interface SubscanTransfer {
  from: string;
  extrinsic_index: string;
  block_timestamp: number;
  success: boolean;
}

export async function incomingTransfers(key: string): Promise<SubscanTransfer[]> {
  const out: SubscanTransfer[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(`${SUBSCAN}/api/v2/scan/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": key },
      body: JSON.stringify({ address: TREASURY_SS58, direction: "received", row: 100, page }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json()) as { code: number; message?: string; data?: { transfers?: SubscanTransfer[] | null } };
    if (body.code !== 0) throw new Error(`Subscan: ${body.message ?? body.code}`);
    const rows = body.data?.transfers ?? [];
    out.push(...rows);
    if (rows.length < 100) break;
  }
  return out;
}

export interface FeeRecord {
  extrinsic: string;
  at: number;
  sender: string;
  volume: bigint;
  treasury: bigint;
  referral: bigint;
}

type Call = { section: string; method: string; args: Array<{ toJSON(): unknown; toString(): string }> };

/** Fee records keyed by extrinsic id; immutable once on-chain, so cache across requests */
const classified = new Map<string, Omit<FeeRecord, "at"> | null>();

export async function classify(api: ApiPromise, extrinsicId: string): Promise<Omit<FeeRecord, "at"> | null> {
  if (classified.has(extrinsicId)) return classified.get(extrinsicId) ?? null;
  const [block, index] = extrinsicId.split("-").map(Number);
  const hash = await api.rpc.chain.getBlockHash(block);
  const signed = (await api.rpc.chain.getBlock(hash)).block.extrinsics[index];
  let record: Omit<FeeRecord, "at"> | null = null;

  const top = signed?.method as unknown as Call | undefined;
  if (top?.section === "utility" && top.method === "batchAll") {
    const calls = top.args[0] as unknown as Call[];
    const [transfer, fee, ref] = calls;
    const feeDest = fee?.args[0]?.toJSON() as { id?: string } | undefined;
    if (
      transfer?.section === "transporter" &&
      fee?.section === "balances" &&
      fee.method === "transferKeepAlive" &&
      feeDest?.id &&
      samePublicKey(feeDest.id, TREASURY_SS58)
    ) {
      const net = BigInt(transfer.args[1].toString());
      const treasury = BigInt(fee.args[1].toString());
      const referral = ref?.section === "balances" ? BigInt(ref.args[1].toString()) : 0n;
      record = {
        extrinsic: extrinsicId,
        sender: signed.signer.toString(),
        volume: net + treasury + referral,
        treasury,
        referral,
      };
    }
  }
  classified.set(extrinsicId, record);
  return record;
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

export function summarize(records: FeeRecord[], since: number) {
  const rs = records.filter((r) => r.at >= since);
  return {
    count: rs.length,
    fees: rs.reduce((s, r) => s + r.treasury, 0n).toString(),
    referralPaid: rs.reduce((s, r) => s + r.referral, 0n).toString(),
    volume: rs.reduce((s, r) => s + r.volume, 0n).toString(),
    users: new Set(rs.map((r) => r.sender)).size,
  };
}
