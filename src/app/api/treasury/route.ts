import { cryptoWaitReady, signatureVerify } from "@polkadot/util-crypto";
import { TREASURY_SS58 } from "@/lib/constants";
import {
  classify,
  consensusApi,
  DAY,
  type FeeRecord,
  incomingTransfers,
  mapLimit,
  summarize,
} from "@/lib/treasury/server";
import { checkChallenge } from "@/lib/treasuryAuth";

// Treasury dashboard data. Only answers to a fresh signature from the treasury key.

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { message?: string; signature?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const { message, signature } = body;
  if (typeof message !== "string" || typeof signature !== "string") {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const challengeError = checkChallenge(message, host);
  if (challengeError) return Response.json({ error: challengeError }, { status: 401 });

  await cryptoWaitReady();
  let valid = false;
  try {
    valid = signatureVerify(message, signature, TREASURY_SS58).isValid;
  } catch {
    valid = false;
  }
  if (!valid) return Response.json({ error: "Signature is not from the treasury account" }, { status: 401 });

  try {
    const api = await consensusApi();
    const account = (await api.query.system.account(TREASURY_SS58)) as unknown as { data: { free: { toString(): string } } };
    const balance = account.data.free.toString();

    const key = process.env.SUBSCAN_API_KEY;
    if (!key) return Response.json({ balance, history: null });

    const incoming = (await incomingTransfers(key)).filter((t) => t.success);
    const unique = [...new Map(incoming.map((t) => [t.extrinsic_index, t])).values()];
    const results = await mapLimit(unique, 8, async (t) => {
      const r = await classify(api, t.extrinsic_index);
      return r ? { ...r, at: t.block_timestamp * 1000 } : null;
    });
    const records = results.filter((r): r is FeeRecord => r !== null).sort((a, b) => b.at - a.at);

    const now = Date.now();
    const startOfToday = new Date(new Date(now).toISOString().slice(0, 10)).getTime();
    const daily = Array.from({ length: 30 }, (_, k) => {
      const dayStart = startOfToday - (29 - k) * DAY;
      const rs = records.filter((r) => r.at >= dayStart && r.at < dayStart + DAY);
      return { day: new Date(dayStart).toISOString().slice(0, 10), fees: rs.reduce((s, r) => s + r.treasury, 0n).toString(), count: rs.length };
    });

    return Response.json({
      balance,
      history: {
        scanned: incoming.length,
        oldest: records.at(-1)?.at ?? null,
        windows: {
          day: summarize(records, now - DAY),
          week: summarize(records, now - 7 * DAY),
          month: summarize(records, now - 30 * DAY),
          all: summarize(records, 0),
        },
        daily,
        recent: records.slice(0, 20).map((r) => ({
          ...r,
          volume: r.volume.toString(),
          treasury: r.treasury.toString(),
          referral: r.referral.toString(),
        })),
      },
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed to load data" }, { status: 502 });
  }
}
