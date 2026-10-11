export const runtime = "nodejs";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const spec = {
    openapi: "3.1.0",
    info: { title: "Colophon API", version: "1.0.0", description: "Point-in-time multiplier and statement endpoints for tokenized stocks. Read-only." },
    servers: [{ url: `${u.protocol}//${u.host}` }],
    paths: {
      "/api/statement": {
        post: {
          summary: "Statement for a wallet at a date",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["wallet"],
                  properties: {
                    wallet: { type: "string" },
                    chain: { type: "string", enum: ["solana", "robinhood"] },
                    asOfTs: { type: "integer", description: "Unix seconds. Defaults to now." },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Statements and offline-verifiable bundles" }, "422": { description: "Rejected: secret-shaped input" } },
        },
      },
      "/api/v1/multiplier": {
        get: {
          summary: "Active multiplier at an instant",
          parameters: [
            { name: "chain", in: "query", schema: { type: "string", enum: ["solana", "robinhood"] } },
            { name: "mint", in: "query", required: true, schema: { type: "string" } },
            { name: "at", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Multiplier with provenance" } },
        },
      },
      "/api/v1/timeline": {
        get: {
          summary: "Recovered multiplier events and coverage",
          parameters: [{ name: "mint", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Events, intervals, coverage" } },
        },
      },
      "/api/v1/verify": {
        get: {
          summary: "Verify a bundle",
          parameters: [{ name: "bundle", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Per-check verdict" } },
        },
        post: { summary: "Verify a bundle (body)", responses: { "200": { description: "Per-check verdict" } } },
      },
      "/api/v1/board": { get: { summary: "Universe rows", responses: { "200": { description: "Rows" } } } },
      "/api/v1/watch": { get: { summary: "Recorded multiplier changes", responses: { "200": { description: "Changes" } } } },
    },
  };
  return new Response(JSON.stringify(spec, null, 2), { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
}
