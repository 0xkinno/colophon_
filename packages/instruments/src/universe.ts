/**
 * Instrument universe registry. Built only from verified on-chain constants.
 */

import { InstrumentDefinition, PreStocksInstrument, XStocksInstrument } from "./adapter.js";
import { VERIFIED_SOLANA_MINTS } from "./constants.js";

function toInstrument(m: (typeof VERIFIED_SOLANA_MINTS)[number]): InstrumentDefinition {
  return m.category === "PreStocks"
    ? new PreStocksInstrument(m.symbol, m.name, m.mint, m.decimals)
    : new XStocksInstrument(m.symbol, m.name, m.mint, m.decimals, m.symbol.replace(/x$/, ""));
}

export const KNOWN_UNIVERSE: InstrumentDefinition[] = VERIFIED_SOLANA_MINTS.map(toInstrument);

const byMint = new Map(KNOWN_UNIVERSE.map((i) => [i.mint, i]));

export function findInstrumentByMint(mint: string): InstrumentDefinition | undefined {
  return byMint.get(mint);
}

export function findInstrumentBySymbol(symbol: string): InstrumentDefinition | undefined {
  const s = symbol.toUpperCase();
  return KNOWN_UNIVERSE.find((inst) => inst.symbol.toUpperCase() === s);
}
