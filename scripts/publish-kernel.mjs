// Stages the kernel as a standalone npm package named @0xkinno/kernel in .publish/kernel,
// validates it with `npm pack --dry-run`, and (with --publish) runs `npm publish --access public`.
//
//   node scripts/publish-kernel.mjs             stage and dry-run only
//   node scripts/publish-kernel.mjs --publish   publish (requires `npm login` first)
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/solana-rpc.mjs";

const NAME = "@0xkinno/kernel";
const src = join(ROOT, "packages", "kernel");
const out = join(ROOT, ".publish", "kernel");
const pkg = JSON.parse(readFileSync(join(src, "package.json"), "utf8"));

execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--filter", "@colophon/kernel", "run", "build"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(src, "dist", "src"), join(out, "dist"), { recursive: true, filter: (p) => !p.endsWith(".map") });
cpSync(join(ROOT, "LICENSE"), join(out, "LICENSE"));

writeFileSync(
  join(out, "package.json"),
  JSON.stringify(
    {
      name: NAME,
      version: pkg.version,
      description:
        "Exact-arithmetic kernel for tokenized-stock statements: replays Token-2022 ScaledUiAmount and ERC-8056 multiplier history and resolves what a wallet held at any instant. Zero dependencies.",
      type: "module",
      main: "./dist/index.js",
      types: "./dist/index.d.ts",
      exports: { ".": { types: "./dist/index.d.ts", import: "./dist/index.js", default: "./dist/index.js" } },
      files: ["dist", "README.md", "LICENSE"],
      sideEffects: false,
      license: "MIT",
      author: "0xkinno",
      repository: { type: "git", url: "git+https://github.com/0xkinno/colophon_.git", directory: "packages/kernel" },
      homepage: "https://colophon-fair.vercel.app",
      bugs: { url: "https://github.com/0xkinno/colophon_/issues" },
      keywords: ["solana", "token-2022", "scaled-ui-amount", "robinhood-chain", "erc-8056", "tokenized-stocks", "statements", "proof"],
      publishConfig: { access: "public" },
      engines: { node: ">=18" },
    },
    null,
    2
  )
);

writeFileSync(
  join(out, "README.md"),
  `# ${NAME}

Exact-arithmetic kernel behind [Colophon](https://colophon-fair.vercel.app): what a wallet actually held in tokenized stocks, on any date.

Tokenized stocks keep a raw balance that never moves and a multiplier that does. The chain stores only the current multiplier, so a balance is true only relative to a clock. This package replays recovered multiplier updates, resolves the multiplier in force at an instant, and does all arithmetic with integers (no floats). Zero dependencies. Runs in Node, browsers and edge runtimes.

\`\`\`bash
npm i ${NAME}
\`\`\`

\`\`\`ts
import { parseDecimal, formatUiAmount, replayScaledUiAmount, resolveReplayAt } from "${NAME}";

// 1.486 shares per token unit after a change took effect
const multiplier = parseDecimal("1.4861347");
formatUiAmount(1_000_000_000n, 9, multiplier, 9); // "1.486134700"

const state = { multiplier: parseDecimal("1"), newMultiplier: parseDecimal("1"), newMultiplierEffectiveTimestamp: 0n };
const updates = [
  {
    signature: "S1", slot: 10n, blockTime: 1_000n, mint: "M",
    newMultiplier: parseDecimal("5"), newMultiplierTimestamp: 2_000n,
  },
];
const { intervals } = replayScaledUiAmount(updates, state);
resolveReplayAt(intervals, 2_000n)?.multiplier; // 5 (the boundary is inclusive)
\`\`\`

## What is inside

- \`parseDecimal\`, \`scaleRaw\`, \`formatUiAmount\`: exact rational arithmetic
- \`replayScaledUiAmount\`, \`resolveReplayAt\`, \`buildEvidenceTimeline\`, \`multiplierAt\`: history replay with the rules measured on Solana devnet
- \`computeRawBalanceAnchored\`, \`generateStatement\`, \`computeStatementHash\`: balance reconstruction and deterministic statements
- Invariant checks I1 to I10

Rules the replay encodes (measured on devnet): the stored multiplier does not roll forward by itself, a second update submitted before the first takes effect erases the first from state, and the effective instant is inclusive.

MIT licensed. Source and evidence: https://github.com/0xkinno/colophon_
`
);

process.stderr.write(`staged ${NAME}@${pkg.version} in .publish/kernel\n`);
execFileSync("npm", ["pack", "--dry-run"], { cwd: out, stdio: "inherit", shell: process.platform === "win32" });
if (process.argv.includes("--publish")) {
  execFileSync("npm", ["publish", "--access", "public"], { cwd: out, stdio: "inherit", shell: process.platform === "win32" });
}
