// Sign-in message for the treasury dashboard. The wallet signs it with signRaw;
// the server checks the signature against the treasury key and that it is fresh.

export const CHALLENGE_TTL_MS = 5 * 60_000;

export function buildChallenge(host: string, now = Date.now()): string {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
  return [
    `${host} — unlock the Vynera treasury dashboard.`,
    "This signature only proves you control the treasury account. It does not authorize any transaction.",
    `Issued at: ${new Date(now).toISOString()}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

/** Validate shape and freshness; returns an error message or null */
export function checkChallenge(message: string, host: string, now = Date.now()): string | null {
  const lines = message.split("\n");
  if (lines.length !== 4 || !lines[0].startsWith(`${host} — `)) return "Unexpected message";
  const issued = Date.parse(lines[2].replace(/^Issued at: /, ""));
  if (!Number.isFinite(issued)) return "Unexpected message";
  if (now - issued > CHALLENGE_TTL_MS) return "Signature expired — unlock again";
  if (issued - now > 60_000) return "Signature from the future";
  return null;
}
