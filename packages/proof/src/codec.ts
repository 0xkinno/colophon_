/**
 * Lossless JSON codec for bundles containing bigint fields.
 * bigint values are written as {"$bigint":"123"} so a bundle can be saved, shared and re-verified offline.
 */
import type { ProofBundle } from "./bundle.js";

export function serializeBundle(bundle: ProofBundle, space = 2): string {
  return JSON.stringify(
    bundle,
    (_k, v) => (typeof v === "bigint" ? { $bigint: v.toString() } : v),
    space
  );
}

export function deserializeBundle(json: string): ProofBundle {
  return JSON.parse(json, (_k, v) => {
    if (v && typeof v === "object" && typeof (v as { $bigint?: unknown }).$bigint === "string") {
      return BigInt((v as { $bigint: string }).$bigint);
    }
    return v;
  }) as ProofBundle;
}
