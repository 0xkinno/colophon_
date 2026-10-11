import { NextResponse } from "next/server";

export function jsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function ok(body: unknown, init: { cache?: boolean } = {}) {
  return NextResponse.json(jsonSafe(body), {
    headers: {
      ...CORS,
      ...(init.cache === false ? { "cache-control": "no-store" } : { "cache-control": "s-maxage=30, stale-while-revalidate=300" }),
    },
  });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: { ...CORS, "cache-control": "no-store" } });
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/** Invariant I9: reject anything shaped like a secret before it touches any logic. */
export function containsSecretShape(input: unknown): string | null {
  const text = JSON.stringify(input ?? "");
  if (/\[\s*\d{1,3}(\s*,\s*\d{1,3}){31,}\s*\]/.test(text)) return "byte array (looks like a keypair)";
  if (/\b[1-9A-HJ-NP-Za-km-z]{86,90}\b/.test(text)) return "base58 string of signature or secret length";
  if (/\b(seed|mnemonic|private[_ ]?key|secret[_ ]?key)\b/i.test(text)) return "field named like a secret";
  if (/\b0x[0-9a-fA-F]{64}\b/.test(text)) return "0x 32-byte hex (looks like an EVM private key)";
  return null;
}
