"use client";
import { useCallback, useState } from "react";
import { createPublicClient, createWalletClient, custom, getAddress, http, verifyTypedData, type Address } from "viem";
import { ROBINHOOD_CHAIN, UNITSEAL_GUARD_ADDRESS } from "@colophon/instruments";
import type { RhStatement } from "@/lib/types";
import { rhExplorer, short } from "@/lib/format";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

const rhChain = {
  id: ROBINHOOD_CHAIN.mainnetChainId,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: ROBINHOOD_CHAIN.mainnetExplorer } },
} as const;

const GUARD_ABI = [
  { type: "function", name: "getCurrentMultiplier", inputs: [{ type: "address", name: "token" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "attestor", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
] as const;

const TYPES = {
  ColophonStatement: [
    { name: "statementHash", type: "bytes32" },
    { name: "token", type: "address" },
    { name: "asOfTs", type: "uint256" },
    { name: "holder", type: "address" },
  ],
} as const;

export function EvmPanel({ onConnected, statement }: { onConnected: (addr: string) => void; statement: RhStatement | null }) {
  const [addr, setAddr] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [guard, setGuard] = useState<string | null>(null);
  const [sig, setSig] = useState<{ signature: string; ok: boolean } | null>(null);

  const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eip1193 }).ethereum : undefined);

  const connect = useCallback(async () => {
    const p = eth();
    if (!p) {
      setMsg("No EIP-1193 wallet found. Install MetaMask or the Robinhood wallet, then retry.");
      return;
    }
    try {
      const accounts = (await p.request({ method: "eth_requestAccounts" })) as string[];
      const a = getAddress(accounts[0]);
      setAddr(a);
      onConnected(a);
      setChainId(parseInt((await p.request({ method: "eth_chainId" })) as string, 16));
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Connection refused");
    }
  }, [onConnected]);

  const switchChain = useCallback(async () => {
    const p = eth();
    if (!p) return;
    const id = `0x${ROBINHOOD_CHAIN.mainnetChainId.toString(16)}`;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: id }] });
    } catch (e) {
      if ((e as { code?: number }).code === 4902) {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: id, chainName: rhChain.name, nativeCurrency: rhChain.nativeCurrency, rpcUrls: rhChain.rpcUrls.default.http, blockExplorerUrls: [ROBINHOOD_CHAIN.mainnetExplorer] }],
        });
      } else {
        setMsg(e instanceof Error ? e.message : "Chain switch refused");
        return;
      }
    }
    setChainId(ROBINHOOD_CHAIN.mainnetChainId);
  }, []);

  const readGuard = useCallback(async () => {
    const row = statement?.holdings[0];
    if (!row) return;
    try {
      const c = createPublicClient({ chain: rhChain, transport: http() });
      const m = await c.readContract({ address: UNITSEAL_GUARD_ADDRESS as Address, abi: GUARD_ABI, functionName: "getCurrentMultiplier", args: [row.token as Address] });
      setGuard(`Guard reports ${m.toString()} for ${row.symbol}. A seal bound to any other value is refused with MultiplierMismatch.`);
    } catch (e) {
      setGuard(`Guard read failed: ${e instanceof Error ? e.message.slice(0, 100) : "error"}`);
    }
  }, [statement]);

  const sign = useCallback(async () => {
    const p = eth();
    const row = statement?.holdings[0];
    if (!p || !addr || !row) return;
    try {
      const wc = createWalletClient({ account: addr, chain: rhChain, transport: custom(p) });
      const message = {
        statementHash: `0x${row.statement.statementHash}` as `0x${string}`,
        token: row.token as Address,
        asOfTs: BigInt(statement!.asOfTs),
        holder: addr,
      };
      const domain = { name: "Colophon", version: "1", chainId: ROBINHOOD_CHAIN.mainnetChainId } as const;
      const signature = await wc.signTypedData({ account: addr, domain, types: TYPES, primaryType: "ColophonStatement", message });
      const ok = await verifyTypedData({ address: addr, domain, types: TYPES, primaryType: "ColophonStatement", message, signature });
      setSig({ signature, ok });
      setMsg(null);
    } catch (e) {
      setMsg(/reject|denied/i.test(String(e)) ? "Signature rejected in the wallet." : e instanceof Error ? e.message.slice(0, 160) : "Signing failed");
    }
  }, [addr, statement]);

  return (
    <div className="panel" style={{ marginTop: 20, display: "grid", gap: 12 }} data-testid="evm-panel">
      <div className="row" style={{ alignItems: "center" }}>
        <strong className="mono">Robinhood Chain wallet</strong>
        {addr && <span className="chip chip--measured">{short(addr, 6, 4)}</span>}
        {chainId !== null && chainId !== ROBINHOOD_CHAIN.mainnetChainId && <span className="chip chip--unknown">chain {chainId}</span>}
      </div>
      <div className="row">
        <button type="button" className="btn btn--ghost btn--sm" onClick={connect}>{addr ? "Reconnect" : "Connect wallet"}</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!addr} onClick={switchChain}>Switch to Robinhood Chain</button>
        <button type="button" className="btn btn--ghost btn--sm" disabled={!statement?.holdings.length} onClick={readGuard}>Read UnitSealGuard</button>
        <button type="button" className="btn btn--purple btn--sm" disabled={!addr || !statement?.holdings.length} onClick={sign}>Sign statement</button>
      </div>
      {guard && <div className="notice">{guard} <a className="mono" href={rhExplorer("address", UNITSEAL_GUARD_ADDRESS)} target="_blank" rel="noreferrer">guard contract</a></div>}
      {sig && (
        <div className={`notice ${sig.ok ? "notice--good" : "notice--bad"}`}>
          <strong className="mono">{sig.ok ? "SIGNATURE VERIFIED" : "SIGNATURE INVALID"}</strong>
          <div className="hash">{sig.signature}</div>
        </div>
      )}
      {msg && <div className="notice notice--warn" role="alert">{msg}</div>}
    </div>
  );
}
