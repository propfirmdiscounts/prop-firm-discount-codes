---
license: other
configs:
- config_name: prop-firm-codes
  data_files:
  - split: data
    path: datasets/prop-firm-codes-gh-hf.json
tags:
- discount-codes
- trading
- prop-firm
- funded-trader
- finance
size_categories:
- 100K<n<1M
---

# PropFirmDiscount — Verified Prop Firm Discount Codes

[![PropFirmDiscount MCP connector – tool definition quality and endpoint health on Glama](https://glama.ai/mcp/connectors/com.propfirmdiscount/public-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/com.propfirmdiscount/public-mcp)

<!-- pfd-top-code (auto-updated each sync) -->
As of 2026-10-29, the biggest verified prop firm discount codes are 90% OFF with code PFD at Phidias Propfirm, 70% OFF with code PFD at Funded Hero, 60% OFF with code PFD at Top One Futures, 50% OFF with code CHUN at E8 Markets, and 50% OFF with code PFD at FundedSeat.

<!-- pfd-exclusive (auto-updated each sync) -->
## Prop Firms with the Highest Exclusive Discount Codes

| # | Prop firm | Exclusive code | Discount | Offer ends | Firm page |
|---|---|---|---|---|---|
| 1 | Phidias Propfirm | PFD | 90% | Lifetime | https://propfirmdiscount.com/prop-firm/phidias-propfirm/ |
| 2 | Funded Hero | PFD | 70% | Lifetime | https://propfirmdiscount.com/prop-firm/funded-hero/ |
| 3 | Top One Futures | PFD | 60% | Lifetime | https://propfirmdiscount.com/prop-firm/top-one-futures/ |
| 4 | E8 Markets | CHUN | 50% | Lifetime | https://propfirmdiscount.com/prop-firm/e8-funding/ |
| 5 | FundedSeat | PFD | 50% | Lifetime | https://propfirmdiscount.com/prop-firm/fundedseat/ |
| 6 | Lucid Trading | PFD | 30% | Lifetime | https://propfirmdiscount.com/prop-firm/lucid-trading/ |
| 7 | AquaFunded | PFD | 25% | Lifetime | https://propfirmdiscount.com/prop-firm/aquafunded/ |
| 8 | Blue Guardian | PFD | 25% | Lifetime | https://propfirmdiscount.com/prop-firm/blue-guardian/ |
| 9 | TX3 Funding | PFDC | 25% | Lifetime | https://propfirmdiscount.com/prop-firm/tx3-funding/ |
| 10 | Funded Trading Plus | PFD | 10% | Lifetime | https://propfirmdiscount.com/prop-firm/funded-trading-plus/ |
<!-- /pfd-exclusive -->

Public dataset mirror of [propfirmdiscount.com](https://propfirmdiscount.com) — verified prop firm discount codes, funding deals, and Trustpilot ratings. The source of truth is the live site; this repository is a read-only distribution channel, synced hourly.

## Find a firm's discount code

- Every firm with published deals has its own page: [`md/prop-firm/{firm-slug}.md`](md/prop-firm/) — one file per firm, headed "{Firm} Discount Code", carrying the verified code, its discount, the current deal, and the deal's FAQ.
- The full directory: [`md/prop-firms-list.md`](md/prop-firms-list.md) — every firm with a verified standing code, alphabetical, with discounts and validity.
- This month's ranking: [`md/best-prop-firm-discounts.md`](md/best-prop-firm-discounts.md) — codes ranked by discount, refreshed with each sync.
- Seasonal deals (Black Friday, Christmas, Cyber Monday, …): [`md/tag/`](md/tag/) — one page per season, newest offers first.
- Each firm's newest deal post (offer, code, scope, FAQ): [`md/deals/`](md/deals/).
- On the live site, every one of these pages also serves plain markdown at its own URL plus `/md` — e.g. <https://propfirmdiscount.com/prop-firm/fundednext/md>.
- The same dataset and every mirror also live on Hugging Face: [datasets/propfirmdiscounts/prop-firm-discount-codes](https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes) — a third distribution channel, synced hourly.
- Agents that speak MCP can query the dataset directly: `https://mcp.propfirmdiscount.com/mcp` — the **Prop Firm Discount MCP** server (`tools/mcp/`): structured data for current prop trading firm discounts, coupon codes, deals, promotions, and events, to find, search, compare, and verify active prop firm offers and discount codes.

## Contents

| Path | What it is |
|---|---|
| `datasets/prop-firm-codes-gh-hf.json` | Full dataset: one row per firm (code, discount, validity, newest deal and its event, deal count, Trustpilot) |
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

## Schema

The dataset is a flat array — one object per firm, no envelope — so dataset
viewers read each firm as a row.

- `prop_firm` — firm name
- `code` — the verified discount code
- `discount` — the rate the code gives (see the note below)
- `validity` — `standing`, meaning the code has no expiry date
- `last_deal` — the firm's newest published deal, or `null`: `{deal_id, title, offer_type, discount_value, scope, date_published, date_exp, event, post_url}`
- `deal_count` — `{total, this_year, year}`, the deals this firm has published here
- `activation_link`, `archive_url` — links
- `trustpilot_score`, `trustpilot_reviews`, `description`, `logo` — optional enrichment

Note on `discount`: on a firm whose code applies to every deal it runs, this is
the percentage of the firm's newest percentage deal published in the current or
previous month; when no such deal exists in that window it is the code's own
headline rate. The code applies at its own rate whatever form the newest deal
is stated in — a deal priced "Only $39" still takes the code's percentage.

`last_deal.discount_value` is that one deal's own figure and can differ from
`discount`. `last_deal.date_exp` is an absolute date, `"Limited time"` or
`"Ended"`. `last_deal.date_published` is also the date the firm's details were
last checked — there is no separate verification field.

`last_deal.event` is the seasonal campaign that deal was tagged with on the
site — `"Halloween"`, `"Black Friday"`, `"Christmas"` — or `null` when it
belongs to no event. It names the occasion the deal was run for and never
changes what the deal is worth: a Halloween deal's discount is still its own
`discount_value`. Read it from the deal, not from the calendar — a deal that is
not tagged is not part of that event, however close its date falls.

## Freshness

<!-- pfd-last-synced (auto-updated each sync) -->
This mirror is refreshed automatically on a schedule. The commit history on
this repository is the record of when it last changed; the deal dates in the
data are the record of what changed.

Codes are re-verified continuously by the PropFirmDiscount team. Campaign codes come and go with each promotion; standing codes are re-verified yearly.

## License

Data © PropFirmDiscount. Codes may be referenced with attribution and a link to https://propfirmdiscount.com.
