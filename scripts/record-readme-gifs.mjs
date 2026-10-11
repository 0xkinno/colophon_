// Records short product clips with Playwright and converts each to an optimized GIF with ffmpeg.
// Usage: BASE_URL=http://localhost:3000 node scripts/record-readme-gifs.mjs
import { chromium } from "playwright";
import { mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/solana-rpc.mjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const RAW = join(ROOT, "docs", "media", "raw");
const OUT = join(ROOT, "docs", "media");
mkdirSync(RAW, { recursive: true });

const shots = [
  { name: "hero", path: "/", ms: 5000 },
  { name: "circuit", path: "/#how", ms: 6000, act: async (p) => { await p.evaluate(() => document.getElementById("how")?.scrollIntoView()); } },
  { name: "toggle", path: "/#problem", ms: 4500, act: async (p) => { await p.evaluate(() => document.getElementById("problem")?.scrollIntoView()); await p.waitForTimeout(1200); await p.getByRole("switch").click(); } },
  { name: "print", path: "/", ms: 800, act: async (p) => { await p.evaluate(() => document.getElementById("print")?.scrollIntoView()); for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 240); await p.waitForTimeout(300); } } },
  { name: "statement", path: "/try", ms: 3500, act: async (p) => { await p.waitForSelector("article.holding", { timeout: 90000 }); await p.waitForTimeout(1500); await p.fill("#date", "2026-06-01"); await p.waitForTimeout(3500); await p.fill("#date", new Date().toISOString().slice(0, 10)); } },
  { name: "verify", path: "/proof", ms: 3500, act: async (p) => { await p.waitForTimeout(1500); await p.evaluate(() => document.querySelector("[data-testid=proof-verifier]")?.scrollIntoView({ block: "center" })); await p.getByRole("button", { name: "Load a real bundle" }).click(); await p.waitForSelector("[data-testid=verifier-result]", { timeout: 60000 }); await p.waitForTimeout(1800); await p.getByRole("button", { name: "Flip one byte" }).click(); } },
  { name: "board", path: "/board", ms: 2500, act: async (p) => { await p.waitForTimeout(2500); for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 260); await p.waitForTimeout(350); } } },
  { name: "tour", path: "/tour", ms: 20000 },
];

const b = await chromium.launch();
for (const s of process.env.SKIP_RECORD ? [] : shots) {
  const dir = join(RAW, s.name);
  mkdirSync(dir, { recursive: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir, size: { width: 1280, height: 800 } } });
  const p = await ctx.newPage();
  await p.goto(BASE + s.path, { waitUntil: "networkidle" });
  if (s.act) await s.act(p);
  await p.waitForTimeout(s.ms);
  await ctx.close();
}
await b.close();

for (const s of shots) {
  const dir = join(RAW, s.name);
  const f = readdirSync(dir).filter((x) => x.endsWith(".webm")).sort((a, b) => statSync(join(dir, b)).mtimeMs - statSync(join(dir, a)).mtimeMs)[0];
  if (!f || !existsSync(join(dir, f))) continue;
  const pal = join(dir, "pal.png");
  const src = join(dir, f);
  try {
  execFileSync("ffmpeg", ["-y", "-i", src, "-vf", "fps=12,scale=900:-1:flags=lanczos,palettegen=stats_mode=diff", pal], { stdio: "ignore" });
  execFileSync("ffmpeg", ["-y", "-i", src, "-i", pal, "-lavfi", "fps=12,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4", join(OUT, `${s.name}.gif`)], { stdio: "ignore" });
  process.stderr.write(`gif ${s.name}\n`);
  } catch {
    process.stderr.write(`ffmpeg failed for ${s.name}
`);
  }
}
