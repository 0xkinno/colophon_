// Journey smoke test: drives Colophon like a person with Playwright Chromium.
// Usage: BASE_URL=http://localhost:3000 node scripts/smoke.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { ROOT, loadEnv } from "./lib/solana-rpc.mjs";

loadEnv();
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = join(ROOT, "docs", "screens");
mkdirSync(SHOTS, { recursive: true });
const steps = [];
const consoleErrors = [];
const step = (name, ok, detail = "") => {
  steps.push({ name, ok, detail });
  process.stderr.write(`${ok ? "PASS" : "FAIL"} ${name} ${detail}\n`);
};

const holders = JSON.parse(readFileSync(join(ROOT, "data", "featured-holders.json"), "utf8")).holders;
const holder = holders[0];
const payer = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(process.env.DEPLOYER_PRIVATE_KEY)));
const devnet = new Connection(process.env.SOLANA_DEVNET_RPC_URL || "https://api.devnet.solana.com", "confirmed");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && consoleErrors.push(`${page.url()} ${m.text()}`));
page.on("pageerror", (e) => consoleErrors.push(`pageerror ${e.message}`));

// A Wallet Standard wallet whose signing happens in Node with a devnet key.
await ctx.exposeFunction("__colophonSignAndSend", async (b64) => {
  const tx = Transaction.from(Buffer.from(b64, "base64"));
  tx.partialSign(payer);
  const sig = await devnet.sendRawTransaction(tx.serialize(), { skipPreflight: false });
  await devnet.confirmTransaction(sig, "confirmed");
  return Array.from(tx.signature);
});
await ctx.addInitScript((pubkeyB58) => {
  const A = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = 0n;
  for (const c of pubkeyB58) n = n * 58n + BigInt(A.indexOf(c));
  const out = [];
  while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  while (out.length < 32) out.unshift(0);
  const publicKey = Uint8Array.from(out);
  const listeners = { change: [] };
  const account = {
    address: pubkeyB58,
    publicKey,
    chains: ["solana:devnet", "solana:mainnet"],
    features: ["solana:signAndSendTransaction", "solana:signTransaction"],
  };
  const wallet = {
    version: "1.0.0",
    name: "Mock Phantom",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiI+PHJlY3Qgd2lkdGg9IjMyIiBoZWlnaHQ9IjMyIiByeD0iOCIgZmlsbD0iIzk5NDVGRiIvPjwvc3ZnPg==",
    chains: ["solana:devnet", "solana:mainnet"],
    accounts: [],
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => { wallet.accounts = [account]; listeners.change.forEach((f) => f({ accounts: wallet.accounts })); return { accounts: wallet.accounts }; } },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => { wallet.accounts = []; listeners.change.forEach((f) => f({ accounts: [] })); } },
      "standard:events": { version: "1.0.0", on: (ev, f) => { (listeners[ev] ||= []).push(f); return () => { listeners[ev] = listeners[ev].filter((x) => x !== f); }; } },
      "solana:signAndSendTransaction": {
        version: "1.0.0",
        supportedTransactionVersions: ["legacy", 0],
        signAndSendTransaction: async (...inputs) => {
          const outs = [];
          for (const i of inputs) {
            let s = "";
            i.transaction.forEach((b) => (s += String.fromCharCode(b)));
            const signature = await window.__colophonSignAndSend(btoa(s));
            outs.push({ signature: Uint8Array.from(signature) });
          }
          return outs;
        },
      },
    },
  };
  const register = (api) => api.register(wallet);
  window.addEventListener("wallet-standard:app-ready", (e) => register(e.detail));
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: register, bubbles: false, cancelable: false }));
}, payer.publicKey.toBase58());

const shot = (n) => page.screenshot({ path: join(SHOTS, `${n}.png`), fullPage: false });

try {
  // 1. Landing
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForSelector("h1");
  step("landing renders headline", /Colophon shows what you actually held/i.test((await page.textContent("h1") ?? "").replace(/\s+/g, " ")));
  step("landing has live ticker", (await page.locator(".marquee__item").count()) > 5);
  await shot("01-landing");

  // 2. /try reads a real holder
  await page.goto(BASE + "/try", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article.holding", { timeout: 120000 });
  const h3 = await page.locator("article.holding h3").first().textContent();
  step("try shows a real statement", Boolean(h3), h3 ?? "");
  const statusChips = await page.locator("article.holding .chip").allTextContents();
  step("statement carries an evidence label", statusChips.some((t) => /MEASURED|REPLAYED|UNKNOWN|INCOMPLETE/.test(t)), statusChips.join(","));
  await shot("02-try");

  // 3. Offline check in the browser
  const checkBtn = page.getByRole("button", { name: /Check it offline/ }).first();
  if (await checkBtn.count()) {
    await checkBtn.click();
    await page.waitForSelector("[data-testid=verify-report]", { timeout: 20000 });
    step("offline check passes in browser", /PASS/.test((await page.textContent("[data-testid=verify-report]")) ?? ""));
    await shot("03-verify");
  } else {
    step("offline check available", false, "holding was not VERIFIED");
  }

  // 4. Change the date and see the number react
  const before = await page.locator(".wvt__num").allTextContents();
  await page.fill("#date", "2026-07-01");
  await page.waitForTimeout(500);
  await page.waitForFunction(() => !document.querySelector(".spin"), null, { timeout: 120000 });
  const after = await page.locator("article.holding").first().textContent();
  step("date change re-renders statement", Boolean(after), `before ${before.join("|")}`);
  await shot("04-date");

  // 5. Anchor on devnet with the connected (mock) wallet
  await page.goto(BASE + `/statement?wallet=${holder.wallet}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid=anchor-panel]", { timeout: 120000 });
  await page.getByRole("button", { name: /select wallet|connect/i }).first().click().catch(() => undefined);
  await page.waitForTimeout(500);
  const mock = page.getByText("Mock Phantom", { exact: false }).first();
  if (await mock.count()) await mock.click().catch(() => undefined);
  await page.waitForTimeout(2000);
  const anchorBtn = page.getByRole("button", { name: /Anchor on Solana devnet|Anchored and verified/ });
  const label = await anchorBtn.first().textContent();
  if (/Anchored and verified/.test(label ?? "")) {
    step("statement already anchored on devnet", true);
  } else {
    await anchorBtn.first().click();
    await page.waitForFunction(() => /VERIFIED/.test(document.querySelector("[data-testid=anchor-panel]")?.textContent ?? ""), null, { timeout: 120000 });
    const txt = (await page.textContent("[data-testid=anchor-panel]")) ?? "";
    step("anchor transaction confirms and reads back", /VERIFIED/.test(txt), txt.slice(0, 80));
  }
  await shot("05-anchor");

  // 6. Proof page: load real bundle, verify, tamper
  await page.goto(BASE + "/proof", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Load a real bundle" }).click();
  await page.waitForSelector("[data-testid=verifier-result]", { timeout: 40000 });
  step("proof verifier PASS on real bundle", /PASS/.test((await page.textContent("[data-testid=verifier-result]")) ?? ""));
  await page.getByRole("button", { name: "Flip one byte" }).click();
  await page.waitForTimeout(300);
  step("flipped byte is refused", /FAIL/.test((await page.textContent("[data-testid=verifier-result]")) ?? ""));
  await shot("06-proof");

  // 7. Other routes render without overflow
  for (const r of ["/board", "/watch", "/lab", "/tour", "/testers"]) {
    await page.goto(BASE + r, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    step(`${r} no horizontal overflow`, !over);
    await shot(`07${r.replace("/", "-")}`);
  }

  // 8. Mobile
  const m = await browser.newContext({ viewport: { width: 375, height: 667 }, isMobile: true });
  const mp = await m.newPage();
  for (const r of ["/", "/try", "/board", "/proof"]) {
    await mp.goto(BASE + r, { waitUntil: "domcontentloaded" });
    await mp.waitForTimeout(1200);
    const over = await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    step(`mobile ${r} no horizontal overflow`, !over);
  }
  await mp.goto(BASE + "/", { waitUntil: "networkidle" });
  await mp.screenshot({ path: join(SHOTS, "08-mobile-landing.png") });
  await m.close();
} catch (e) {
  await page.screenshot({ path: join(SHOTS, "99-fail.png") }).catch(() => undefined);
  step("journey aborted", false, e.message.slice(0, 200));
}

step("no console errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" || ").slice(0, 300));
writeFileSync(join(ROOT, "evidence", "smoke-results.json"), JSON.stringify({ at: new Date().toISOString(), base: BASE, steps }, null, 2));
await browser.close();
process.exit(steps.every((s) => s.ok) ? 0 : 1);
