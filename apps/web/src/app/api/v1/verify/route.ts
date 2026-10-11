import { deserializeBundle } from "@colophon/proof";
import { verifyProofBundleOffline } from "@colophon/verifier";
import { ok, fail, preflight, containsSecretShape } from "@/server/json";

export const runtime = "nodejs";

export async function OPTIONS() {
  return preflight();
}

function run(json: string) {
  const secret = containsSecretShape(JSON.parse(json, (_k, v) => v));
  if (secret) return fail(`Refused: bundle contains a ${secret}.`, 422);
  const bundle = deserializeBundle(json);
  const report = verifyProofBundleOffline(bundle);
  return ok(report, { cache: false });
}

/** GET ?bundle=<base64url of the bundle JSON> */
export async function GET(req: Request) {
  const b = new URL(req.url).searchParams.get("bundle");
  if (!b) return fail("bundle query parameter (base64url bundle JSON) is required");
  try {
    return run(Buffer.from(b, "base64url").toString("utf8"));
  } catch {
    return fail("bundle is not valid base64url JSON");
  }
}

export async function POST(req: Request) {
  try {
    return run(await req.text());
  } catch {
    return fail("body must be a Colophon bundle JSON");
  }
}
