import icons from "@/data/generated/icons.json";

const ICONS = new Set(icons as string[]);
export const tokenIcon = (mint: string): string | null => (ICONS.has(mint) ? `/tokens/${mint}.png` : null);

export const short = (s: string, a = 4, b = 4) => (s.length > a + b + 1 ? `${s.slice(0, a)}...${s.slice(-b)}` : s);

export const solExplorer = (kind: "tx" | "address", id: string, cluster: "mainnet" | "devnet" = "mainnet") =>
  `https://explorer.solana.com/${kind}/${id}${cluster === "devnet" ? "?cluster=devnet" : ""}`;

export const rhExplorer = (kind: "tx" | "address", id: string) => `https://robinhoodchain.blockscout.com/${kind}/${id}`;

export const isoDate = (ts: number) => new Date(ts * 1000).toISOString().slice(0, 10);

export function groupDigits(s: string): string {
  const [w, f] = s.split(".");
  return w.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (f !== undefined ? "." + f : "");
}

export function trimUnits(s: string, places = 4): string {
  const [w, f = ""] = s.split(".");
  const fr = f.slice(0, places).replace(/0+$/, "");
  return groupDigits(w) + (fr ? "." + fr : "");
}
