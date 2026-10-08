# PropFirmDiscount MCP server

Public, read-only MCP server for propfirmdiscount.com. A Cloudflare Worker
serving **Streamable HTTP (stateless)** JSON-RPC at `POST /mcp` — one request,
one response, no SSE session.

Live endpoint: `https://mcp.propfirmdiscount.com/mcp`

## Data sources (all public, cached 10 min)

- `https://propfirmdiscount.com/api/prop-firm-codes/` — verified standing
  exclusive codes (49 firms).
- `https://propfirmdiscount.com/category/prop-firm-coupon/md` — the rolling
  **2-month** deal table (the coupon parent category, which unions its
  campaign-coded and code-free children). The deal window and per-row
  `code_state` are the site's own.
- `https://propfirmdiscount.com/prop-firm/{slug}/md` — firm markdown mirrors.
- `https://propfirmevents.com/dataset.json` — the seasonal event archive.

## Tools

| Tool | Returns |
|---|---|
| `list_codes` | Discount codes that work any time; filter by firm / active / min discount |
| `get_firm` | One firm: its discount code, discount, activation link, mirror URL |
| `get_firm_markdown` | Markdown mirror of a firm page (cap 20 KB) |
| `latest_deals` | Newest deals in the rolling 2-month window |
| `search_deals` | Deals by firm / keyword / min discount |
| `list_events` | Seasonal events & holidays with deal counts |
| `get_event` | Every recorded deal for one event slug |
| `get_dataset_meta` | Row counts + deals window start |

### Code semantics

- **Standing code** (`list_codes`, `get_firm`, `standing_code` on deal rows):
  a verified standing exclusive code. It works any time (lifetime); the
  validity window is a procedural calendar-year label, not an expiry.
- **Deal rows**: `code` has a value only when `code_state` is `standing`. For
  `campaign` (a limited-time code lives on the deal page) or `none` it is
  `null` — direct the user to `get_code_url` to see the code. `standing_code`
  is present on any row whose firm has one, independent of the deal's own code;
  never imply it applies to a campaign's discount.

## Local dev

```bash
cd tools/mcp
npx wrangler@4 dev --config wrangler.mcp.toml   # http://127.0.0.1:8787
```

## Deploy

Deployed by `.github/workflows/satellites.yml` (job `mcp`) with
`npx wrangler@4 deploy --config tools/mcp/wrangler.mcp.toml`, using the
repository's `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` secrets.

The custom domain `mcp.propfirmdiscount.com` is attached **once, manually**, in
the Cloudflare dashboard (Workers & Pages → pfd-mcp → Settings → Domains &
Routes → Add → Custom Domain) — the deploy token does not manage zone DNS, and
this keeps the deploy job from failing on a route change. `workers_dev = false`
in the config, so no account-identifying `*.workers.dev` address is published;
if the domain is not attached yet, the worker has no public URL.

## Client config (Claude Desktop / MCP clients)

```json
{
  "mcpServers": {
    "propfirmdiscount": { "url": "https://mcp.propfirmdiscount.com/mcp" }
  }
}
```

## Smoke test

```bash
curl -s https://mcp.propfirmdiscount.com/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```