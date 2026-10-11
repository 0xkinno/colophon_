// Records a real UnitSealGuard refusal on Robinhood Chain mainnet.
//
// A seal is signed (EIP-712) by the guard's attestor for an expected multiplier that is one wei stale.
// Submitting it makes the guard revert with MultiplierMismatch(expected, current).
//
//   node scripts/guard-refusal.mjs            simulate only (eth_call, free), prints the decoded revert
//   node scripts/guard-refusal.mjs --send     submit the transaction with a fixed gas limit so it lands
//                                             and reverts on chain; writes evidence/guard/refusal.json
//
// Environment (.env.local): ROBINHOOD_RPC_URL, UNITSEAL_ATTESTOR_PRIVATE_KEY (signs the seal),
// RH_SENDER_PRIVATE_KEY (pays gas; defaults to the attestor key). The sender needs a little ETH.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, createWalletClient, http, decodeErrorResult, getAddress, keccak256, toHex, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ROOT, loadEnv } from "./lib/solana-rpc.mjs";

loadEnv();
const SEND = process.argv.includes("--send");
const GUARD = getAddress(process.env.NEXT_PUBLIC_UNITSEAL_GUARD_ADDRESS || "0x2518853d8a6799734ded70857f0cffc26a175c14");
const TOKEN = getAddress("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9");
const RPC = process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const attestorKey = process.env.UNITSEAL_ATTESTOR_PRIVATE_KEY;
if (!attestorKey) throw new Error("UNITSEAL_ATTESTOR_PRIVATE_KEY is not set in .env.local");
const senderKey = process.env.RH_SENDER_PRIVATE_KEY || attestorKey;

const chain = { id: 4663, name: "Robinhood Chain", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };
const pub = createPublicClient({ chain, transport: http(RPC) });
const attestor = privateKeyToAccount(attestorKey);
const sender = privateKeyToAccount(senderKey);

const ABI = [
  {
    type: "function", name: "executeSeal", stateMutability: "nonpayable",
    inputs: [
      { name: "attestation", type: "tuple", components: [
        { name: "chainId", type: "uint256" }, { name: "token", type: "address" }, { name: "sealId", type: "bytes32" },
        { name: "planHash", type: "bytes32" }, { name: "stateHash", type: "bytes32" }, { name: "expectedMultiplier", type: "uint256" },
        { name: "rawAmount", type: "uint256" }, { name: "recipient", type: "address" }, { name: "expiry", type: "uint256" }, { name: "capability", type: "string" },
      ] },
      { name: "signature", type: "bytes" },
    ],
    outputs: [{ type: "bool" }],
  },
  { type: "error", name: "MultiplierMismatch", inputs: [{ name: "expected", type: "uint256" }, { name: "current", type: "uint256" }] },
  { type: "error", name: "InvalidAttestor", inputs: [{ name: "sealId", type: "bytes32" }] },
  { type: "error", name: "SealExpired", inputs: [{ type: "bytes32" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "SealAlreadyExecuted", inputs: [{ type: "bytes32" }] },
  { type: "error", name: "ChainIdMismatch", inputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "error", name: "TokenMismatch", inputs: [{ type: "address" }, { type: "address" }] },
  { type: "error", name: "TransferFailed", inputs: [] },
];

const current = await pub.readContract({ address: TOKEN, abi: [{ type: "function", name: "uiMultiplier", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" }], functionName: "uiMultiplier" });
const stale = current - 1n;
const sealId = keccak256(toHex(`colophon-refusal-${Date.now()}`));
const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
const message = {
  chainId: 4663n, token: TOKEN, sealId,
  planHash: keccak256(toHex("colophon:stale-multiplier-demo")),
  stateHash: keccak256(toHex(`uiMultiplier=${stale}`)),
  expectedMultiplier: stale, rawAmount: 1n, recipient: getAddress("0x000000000000000000000000000000000000dEaD"),
  expiry, capability: "market",
};
const types = { SealAttestation: [
  { name: "chainId", type: "uint256" }, { name: "token", type: "address" }, { name: "sealId", type: "bytes32" },
  { name: "planHash", type: "bytes32" }, { name: "stateHash", type: "bytes32" }, { name: "expectedMultiplier", type: "uint256" },
  { name: "rawAmount", type: "uint256" }, { name: "recipient", type: "address" }, { name: "expiry", type: "uint256" }, { name: "capability", type: "string" },
] };
const signature = await attestor.signTypedData({ domain: { name: "UnitSealGuard", version: "1", chainId: 4663n, verifyingContract: GUARD }, types, primaryType: "SealAttestation", message });
const data = encodeFunctionData({ abi: ABI, functionName: "executeSeal", args: [message, signature] });

const decode = (e) => {
  const raw = e?.walk?.((x) => x?.data)?.data ?? e?.data ?? e?.cause?.data;
  try {
    const d = decodeErrorResult({ abi: ABI, data: raw });
    return { name: d.errorName, args: (d.args ?? []).map(String) };
  } catch {
    return { name: "UNDECODED", args: [String(e?.shortMessage ?? e?.message).slice(0, 160)] };
  }
};

let simulated;
try {
  await pub.call({ account: sender.address, to: GUARD, data });
  simulated = { name: "NO_REVERT", args: [] };
} catch (e) {
  simulated = decode(e);
}
process.stderr.write(`current uiMultiplier ${current}, sealed ${stale}\nsimulated: ${simulated.name}(${simulated.args.join(", ")})\n`);

const out = {
  generatedAt: new Date().toISOString(),
  chainId: 4663,
  guard: GUARD,
  token: TOKEN,
  attestor: attestor.address,
  sender: sender.address,
  currentMultiplier: current.toString(),
  sealedMultiplier: stale.toString(),
  simulated,
  transaction: null,
};

if (SEND) {
  const wallet = createWalletClient({ account: sender, chain, transport: http(RPC) });
  const hash = await wallet.sendTransaction({ to: GUARD, data, gas: 300000n });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  out.transaction = {
    hash,
    block: receipt.blockNumber.toString(),
    status: receipt.status,
    explorer: `https://robinhoodchain.blockscout.com/tx/${hash}`,
  };
  process.stderr.write(`tx ${hash} status ${receipt.status}\n`);
}

mkdirSync(join(ROOT, "evidence", "guard"), { recursive: true });
writeFileSync(join(ROOT, "evidence", "guard", SEND ? "refusal.json" : "refusal-simulated.json"), JSON.stringify(out, null, 2));
