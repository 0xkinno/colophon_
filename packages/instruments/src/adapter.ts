/**
 * COLOPHON: Instrument Adapters
 *
 * Implements strict domain separation between Public Equities (xStocks)
 * and Pre-IPO Private Company Exposure (PreStocks).
 * Strictly complies with terminology requirements from §16.
 */

export type InstrumentCategory = "xStocks" | "PreStocks";

export interface InstrumentDefinition {
  readonly symbol: string;
  readonly name: string;
  readonly mint: string;
  readonly category: InstrumentCategory;
  readonly decimals: number;
  readonly underlyingSymbol?: string;
  readonly unitName: "SHARES" | "TOKEN UNITS";
  readonly exposureDescription: string;
  readonly legalDisclaimer: string;
}

export class XStocksInstrument implements InstrumentDefinition {
  readonly category = "xStocks" as const;
  readonly unitName = "SHARES" as const;
  readonly legalDisclaimer =
    "Tokenized stock shares representing underlying public equity exposure via Token-2022 ScaledUiAmount protocol.";

  constructor(
    public readonly symbol: string,
    public readonly name: string,
    public readonly mint: string,
    public readonly decimals = 9,
    public readonly underlyingSymbol?: string
  ) {}

  get exposureDescription(): string {
    return `Tokenized public shares of ${this.name} (${this.underlyingSymbol ?? this.symbol})`;
  }
}

export class PreStocksInstrument implements InstrumentDefinition {
  readonly category = "PreStocks" as const;
  readonly unitName = "TOKEN UNITS" as const;
  readonly legalDisclaimer =
    "TOKEN UNITS: economic exposure to private company secondary valuation. NOT a legal equity share, voting share, or direct equity certificate.";

  constructor(
    public readonly symbol: string,
    public readonly name: string,
    public readonly mint: string,
    public readonly decimals = 9
  ) {}

  get exposureDescription(): string {
    return `Private-market economic exposure units for ${this.name}`;
  }
}
