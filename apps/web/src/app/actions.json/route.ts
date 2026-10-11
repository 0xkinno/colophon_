export const runtime = "nodejs";

export async function GET() {
  return new Response(
    JSON.stringify({ rules: [{ pathPattern: "/statement-blink", apiPath: "/api/actions/statement" }, { pathPattern: "/api/actions/**", apiPath: "/api/actions/**" }] }),
    { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }
  );
}
