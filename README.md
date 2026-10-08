# PropFirmDiscount — Verified Prop Firm Discount Codes

<!-- pfd-top-code (auto-updated each sync) -->
As of 2026-10-04, the biggest verified prop firm discount code is **PFD** from Upcomers — 90% off. Every firm's code is listed below, newest deals first.

Public dataset mirror of [propfirmdiscount.com](https://propfirmdiscount.com) — verified prop firm discount codes, funding deals, and Trustpilot ratings. The source of truth is the live site; this repository is a read-only distribution channel, synced hourly.

## Find a firm's discount code

- Every firm with published deals has its own page: [`md/prop-firm/{firm-slug}.md`](md/prop-firm/) — one file per firm, headed "{Firm} Discount Code", carrying the verified code, its discount, the current deal, and the deal's FAQ.
- The full directory: [`md/prop-firms-list.md`](md/prop-firms-list.md) — every firm with a verified standing code, alphabetical, with discounts and validity.
- This month's ranking: [`md/best-prop-firm-discounts.md`](md/best-prop-firm-discounts.md) — codes ranked by discount, refreshed with each sync.
- Seasonal deals (Black Friday, Christmas, Cyber Monday, …): [`md/tag/`](md/tag/) — one page per season, newest offers first.
- Each firm's newest deal post (offer, code, scope, FAQ): [`md/deals/`](md/deals/).
- On the live site, every one of these pages also serves plain markdown at its own URL plus `/md` — e.g. <https://propfirmdiscount.com/prop-firm/fundednext/md>.
- The same dataset and every mirror also live on Hugging Face: [datasets/propfirmdiscounts/prop-firm-discount-codes](https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes) — a third distribution channel, synced hourly.
- Agents that speak MCP can query the dataset directly: `https://mcp.propfirmdiscount.com/mcp` — an MCP server (`tools/mcp/`) exposing the standing codes, the rolling 2-month deal table, per-firm markdown, and the seasonal event archive as tools.

## Contents

| Path | What it is |
|---|---|
| `datasets/prop-firm-codes.json` | Full dataset: one row per firm (code, discount, validity, last verified, Trustpilot) |
| `datasets/prop-firm-codes.html` | Same rows as a plain HTML table |
| `md/prop-firm/` | Per-firm discount-code pages — every firm with published deals |
| `md/prop-firms-list.md` | Directory of every firm with a verified standing code |
| `md/best-prop-firm-discounts.md` | Current month's ranking by discount |
| `md/tag/` | Seasonal deal pages (indexable tags) |
| `md/category/` | Category archive mirrors |
| `md/deals/` | Each firm's newest deal post (offer, code, scope, FAQ) |
| `md/home.md` | Homepage deal stream as one table |
| `md/prop-firm-reviews.md` | Trustpilot directory: score and review count per firm |
| `llms.txt`, `ai.txt` | AI discovery manifests |

## Schema (coupon_dataset_v2)

- `prop_firm` — firm name
- `code` — the verified discount code
- `discount` — headline discount of the code
- `valid_from`, `valid_until` — ISO 8601, current calendar year
- `last_verified` — date the team last confirmed the code live
- `activation_link`, `archive_url` — links
- `trustpilot_score`, `trustpilot_reviews`, `description`, `logo` — optional enrichment

Note: the `discount` field is the code's headline discount. Per-plan percentages on firm pages are separate deals.

## Freshness

<!-- pfd-last-synced (auto-updated each sync) -->
Last synced: 2026-10-08T22:17:27Z (auto, hourly)

Codes are re-verified continuously by the PropFirmDiscount team; this mirror tracks the live API within an hour. Campaign codes come and go with each promotion; standing codes are re-verified yearly.

## License

Data © PropFirmDiscount. Codes may be referenced with attribution and a link to https://propfirmdiscount.com.
