// Prop Firm Event Hub — static demo builder (local only).
// Reads only the markdown mirrors + the public codes dataset from this repo;
// never touches the database. Mirrors are refreshed hourly by sync.yml, so the
// demo is byte-for-byte downstream of prod.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc, EN_DASH, monthYearUTC, layout, DISCLOSURE, robotsTxt, sitemapXml,
  aiSitemapXml, assertClean, publisherOrg,
} from '../satellites/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (k) => (argv.indexOf(k) >= 0 ? resolve(argv[argv.indexOf(k) + 1]) : null);
const repoRoot = argOf('--root') || resolve(here, '../..');
const outRoot = argOf('--out') || join(here, 'dist');

// ── calendar registry ───────────────────────────────────────────
// Category slugs are term slugs under 163; tag slugs are the event tags
// mirrored into md/tag/. `black-friday` (and a few others) exist as BOTH a
// category and a tag, so the two groups keep separate paths and never merge.
const CATEGORY_SLUGS = [
  'black-friday', 'cyber-monday', 'christmas-deals', 'new-year-sale',
  'halloween-deals', 'festive-anniversary-deals', 'thanksgiving-deals',
  'valentine-deals', 'ramadan-deals', 'easter-deals',
];
const TAG_SLUGS = [
  'diwali', 'eid-al-adha', 'independence-day', 'labor-day', 'memorial-day',
  'world-cup', 'fathers-day', 'holi-festival', 'international-womens-day',
  'international-workers-day', 'lunar-new-year', 'mothers-day', 'presidents-day',
];
// Display names that title-casing the slug would get wrong.
const CAL_NAMES = {
  'black-friday': 'Black Friday', 'cyber-monday': 'Cyber Monday',
  'christmas-deals': 'Christmas Deals', 'new-year-sale': 'New Year Sale',
  'halloween-deals': 'Halloween Deals', 'festive-anniversary-deals': 'Festive Anniversary Deals',
  'thanksgiving-deals': 'Thanksgiving Deals', 'valentine-deals': 'Valentine Deals',
  'ramadan-deals': 'Ramadan Deals', 'easter-deals': 'Easter Deals',
  'eid-al-adha': 'Eid al-Adha', 'independence-day': 'Independence Day',
  'labor-day': 'Labor Day', 'memorial-day': 'Memorial Day', 'world-cup': 'World Cup',
  'fathers-day': "Father's Day", 'holi-festival': 'Holi Festival',
  'international-womens-day': "International Women's Day",
  'international-workers-day': 'International Workers Day',
  'lunar-new-year': 'Lunar New Year', 'mothers-day': "Mother's Day",
  'presidents-day': 'Presidents Day',
};
const calName = (slug) => CAL_NAMES[slug] || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const site = {
  id: 'events',
  siteName: 'Prop Firm Event Hub',
  tagline: EN_DASH + ' seasonal prop firm deal calendars',
  origin: (process.env.SATELLITE_ORIGIN_EVENTS || 'https://propfirmevent.example').replace(/\/$/, ''),
  icons: false,
  disclosure: DISCLOSURE,
};
site.email = `hello@${site.origin.replace(/^https?:\/\//, '')}`;

// ── mirror parsing ──────────────────────────────────────────────
// Category and tag mirrors share one table shape. The Code column carries
// either the firm's standing code (already public) or one of two public-safe
// labels; a campaign code value never appears in a mirror.
function parseEventMirror(md) {
  const rows = [];
  let inTable = false;
  for (const raw of md.split('\n')) {
    if (/^\|\s*Published\s*\|\s*Firm\s*\|/.test(raw)) { inTable = true; continue; }
    if (!inTable) continue;
    const line = raw.trim();
    if (/^\|[\s|:-]+$/.test(line)) continue;
    if (!line.startsWith('|')) { inTable = false; continue; }
    const cells = line.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
    if (cells.length < 6) continue;
    const [published, firm, dealCell, discount, code] = cells;
    const lm = /^\[(.+?)\]\((\S+?)\)$/.exec(dealCell);
    rows.push({
      published,
      firm: firm.trim(),
      title: lm ? lm[1] : dealCell,
      url: lm ? lm[2] : cells[5].trim(),
      discount: discount.trim(),
      code: code.trim(),
      codeState: code.trim() === 'Campaign Code Required' ? 'campaign'
        : code.trim() === 'No Code Required' ? 'none' : 'standing',
    });
  }
  rows.sort((a, b) => b.published.localeCompare(a.published));
  return rows;
}

const readMirror = (rel) => {
  const p = join(repoRoot, 'md', rel);
  return existsSync(p) ? parseEventMirror(readFileSync(p, 'utf8')) : [];
};

function loadCodes() {
  const raw = JSON.parse(readFileSync(join(repoRoot, 'datasets', 'prop-firm-codes.json'), 'utf8'));
  return Array.isArray(raw) ? raw : (raw.data || []);
}
const pctOf = (s) => {
  const m = /^(\d+(?:\.\d+)?)\s*%/.exec(String(s || ''));
  return m ? Number(m[1]) : null;
};
// Deal titles sometimes carry the firm again as a "(Firm)" suffix; the
// leaderboard keys firms on the canonical name so a firm never splits rows.
const canonicalFirm = (f) => String(f || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

// ── rendering ───────────────────────────────────────────────────
const codeCell = (r) => (r.codeState === 'standing' ? `<code>${esc(r.code)}</code>` : esc(r.code));

function dealsTable(rows) {
  return `<table class="checks">
<thead><tr><th scope="col">Published</th><th scope="col">Firm</th><th scope="col">Deal</th><th scope="col">Offer</th><th scope="col">Code</th></tr></thead>
<tbody>
${rows.map((r) => `<tr><td><time datetime="${esc(r.published)}">${esc(r.published)}</time></td><td>${esc(r.firm || EN_DASH)}</td><td><a rel="nofollow" href="${esc(r.url)}">${esc(r.title)}</a></td><td>${esc(r.discount || EN_DASH)}</td><td>${codeCell(r)}</td></tr>`).join('\n')}
</tbody>
</table>`;
}

function calendarTable(items, hrefOf) {
  return `<table class="checks">
<thead><tr><th scope="col">Calendar</th><th scope="col">Deals</th><th scope="col">Newest</th></tr></thead>
<tbody>
${items.map(({ slug, name, rows }) => `<tr><td><a href="${hrefOf(slug)}">${esc(name)}</a></td><td>${rows.length}</td><td>${rows[0] ? `<time datetime="${esc(rows[0].published)}">${esc(rows[0].published)}</time>` : EN_DASH}</td></tr>`).join('\n')}
</tbody>
</table>`;
}

function monthName(ym) {
  if (!ym) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${ym}-01T00:00:00Z`));
}
const monthOf = (date) => String(date || '').slice(0, 7);

// ── leaderboard ─────────────────────────────────────────────────
// Window = the two most recent months that carry a seasonal deal, so the
// ranking always reflects an active season rather than one lonely month.
function leaderboard(poolRows) {
  const months = [...new Set(poolRows.map((r) => monthOf(r.published)).filter(Boolean))].sort().reverse();
  const win = months.slice(0, 2);
  const windowed = win.length ? poolRows.filter((r) => win.includes(monthOf(r.published))) : [];
  const use = windowed.length ? windowed : poolRows;
  const label = win.length
    ? `${monthName(win[win.length - 1])}${win[1] ? ` ${EN_DASH} ${monthName(win[0])}` : ''}`
    : 'on record';
  const best = new Map();
  for (const r of use) {
    const p = pctOf(r.discount);
    if (p === null) continue;
    const key = canonicalFirm(r.firm) || r.firm;
    const cur = best.get(key);
    if (!cur || p > cur.pct || (p === cur.pct && r.published > cur.row.published)) best.set(key, { pct: p, row: r });
  }
  const ranks = [...best.entries()]
    .sort((a, b) => b[1].pct - a[1].pct || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([firm, v], i) => ({ rank: i + 1, firm, pct: v.pct, title: v.row.title, url: v.row.url, published: v.row.published }));
  return { label, windowed: windowed.length > 0, ranks };
}

// ── JSON-LD helpers ─────────────────────────────────────────────
const webSiteNode = () => ({ '@type': 'WebSite', '@id': `${site.origin}/#website`, url: site.origin, name: site.siteName, publisher: { '@id': `${site.origin}/#org` } });
const firmId = (name) => `${site.origin}/#firm-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

// ── homepage ────────────────────────────────────────────────────
function hubPage(latest, cals, tags, codes, board, totalDeals, now) {
  const title = `Prop Firm Event Deals ${EN_DASH} Seasonal Discount Code Calendars ${monthYearUTC(now)}`;
  const desc = `Event hub tracking ${totalDeals} dated seasonal prop firm deals across ${cals.length} holiday categories and ${tags.length} event tags, newest first, each row marked with how its code redeems. Updated ${monthYearUTC(now)}.`.slice(0, 300);
  const pages = [...cals.map((c) => ({ slug: c.slug, name: c.name, href: `/${c.slug}/` })), ...tags.map((t) => ({ slug: t.slug, name: t.name, href: `/tag/${t.slug}/` }))];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      webSiteNode(), publisherOrg(site),
      {
        '@type': 'CollectionPage', '@id': `${site.origin}/`, url: `${site.origin}/`, name: title, description: desc,
        dateModified: now.toISOString().slice(0, 10), isPartOf: { '@id': `${site.origin}/#website` },
        mainEntity: {
          '@type': 'ItemList', numberOfItems: pages.length,
          itemListElement: pages.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site.origin}${p.href}`, name: `${p.name} prop firm deals` })),
        },
      },
    ],
  };
  const boardTable = board.ranks.length ? `<table class="checks">
<thead><tr><th scope="col">Rank</th><th scope="col">Firm</th><th scope="col">Best discount</th><th scope="col">Deal</th><th scope="col">Published</th></tr></thead>
<tbody>
${board.ranks.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.firm)}</td><td>${r.pct}% Off</td><td><a rel="nofollow" href="${esc(r.url)}">${esc(r.title)}</a></td><td><time datetime="${esc(r.published)}">${esc(r.published)}</time></td></tr>`).join('\n')}
</tbody>
</table>` : '<p>No percentage offers are on record for the current window yet.</p>';
  const body = `<h1>Prop Firm Event Deals &amp; Seasonal Discount Codes</h1>
<p class="answer">This hub tracks ${totalDeals} dated seasonal deals from proprietary trading firms across ${cals.length} holiday categories and ${tags.length} event tags, newest first. Every row states how the offer redeems: the firm's standing code, a campaign code entered at checkout, or no code at all.${board.ranks.length ? ` The deepest cut in the ${esc(board.label)} window is ${board.ranks[0].pct}% off from ${esc(board.ranks[0].firm)}.` : ''}</p>

<h2 id="latest">Latest seasonal deals</h2>
${dealsTable(latest)}

<h2 id="calendars">Event &amp; holiday calendars</h2>
<p>Ten holiday categories and ${tags.length} event tags, each with its own dated deal log. Pick a season to see every offer recorded under it.</p>
<h3>Holiday categories</h3>
${calendarTable(cals, (slug) => `/${slug}/`)}
<h3>Event tags</h3>
${calendarTable(tags, (slug) => `/tag/${slug}/`)}

<h2 id="leaderboard">Top seasonal discounts ${EN_DASH} ${esc(board.label)}</h2>
<p>The ten firms with the deepest percentage offer among seasonal deals published in the most recent active months${board.windowed ? '' : ' on record'}. Ranking uses each firm's best single deal in the window; ties break on publish date.</p>
${boardTable}

<h2 id="codes">Exclusive prop firm discount codes</h2>
<p>These are the firms' standing codes: they work any time, inside or outside an event window. Listed as plain text on purpose ${EN_DASH} copy the code straight from the table, no click needed.</p>
<table class="checks">
<thead><tr><th scope="col">Firm</th><th scope="col">Standing code</th><th scope="col">Discount</th></tr></thead>
<tbody>
${codes.map((c) => `<tr><td>${esc(c.prop_firm)}</td><td><code>${esc(c.code)}</code></td><td>${esc(c.discount)}</td></tr>`).join('\n')}
</tbody>
</table>
<p>Looking for the verification trail behind each code, with the dated deals it applied to? See the firm pages on <a href="https://propfirmdiscount.com/">PropFirmDiscount</a>, or the machine-readable <a href="/dataset.json">dataset.json</a>.</p>

<h2 id="method">About this hub and how the code column works</h2>
<p>${esc(site.siteName)} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2024. Every calendar mirrors the dated deal archive on <a href="https://propfirmdiscount.com/">propfirmdiscount.com</a>, refreshed hourly.</p>
<p>Reading the Code column: a code shown in the column is the firm's standing code and the deal redeems on it any time; "Campaign Code Required" means checkout asks for the deal's own limited-time code, which lives on the deal page; "No Code Required" means the offer applies to the account without entering anything.</p>
<p>A row's date is the day the firm's deal went live ${EN_DASH} it is a publish date, not a claim that the offer was re-tested that day. Corrections welcome: email <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> and the calendar updates in the next rebuild. Machine readers: <a href="/dataset.json">dataset.json</a> carries every row, <a href="/llms.txt">llms.txt</a> maps the site.</p>`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}/`, ld, body, path: null, altMarkdown: '/index.md' }) };
}

// ── calendar (roundup) page ─────────────────────────────────────
function roundupPage(cal, kind, others, now) {
  const rows = cal.rows;
  const newest = rows[0] || null;
  const nStanding = rows.filter((r) => r.codeState === 'standing').length;
  const nCampaign = rows.filter((r) => r.codeState === 'campaign').length;
  const nNone = rows.filter((r) => r.codeState === 'none').length;
  const path = kind === 'category' ? `/${cal.slug}` : `/tag/${cal.slug}`;
  const title = `${cal.name} Prop Firm Deals ${EN_DASH} ${rows.length} Dated Offers ${monthYearUTC(now)}`;
  const desc = (kind === 'category'
    ? `${cal.name} prop firm deal calendar: ${rows.length} dated seasonal offers, newest first, each marked standing code, campaign code required or no code required.`
    : `Prop firm deals tagged ${cal.name}: ${rows.length} dated offers across every season, newest first, each marked with how its code redeems.`) + ` Updated ${monthYearUTC(now)}.`;
  const shortDesc = desc.slice(0, 300);
  const firms = new Map();
  for (const r of rows) {
    const name = canonicalFirm(r.firm) || r.firm;
    if (!firms.has(name)) firms.set(name, firmId(name));
  }
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      webSiteNode(), publisherOrg(site),
      ...[...firms.entries()].map(([name, id]) => ({ '@type': 'Organization', '@id': id, name })),
      {
        '@type': 'CollectionPage', '@id': `${site.origin}${path}/`, url: `${site.origin}${path}/`, name: title, description: shortDesc,
        dateModified: now.toISOString().slice(0, 10), isPartOf: { '@id': `${site.origin}/#website` },
        mainEntity: {
          '@type': 'ItemList', numberOfItems: rows.length,
          itemListElement: rows.map((r, i) => ({
            '@type': 'ListItem', position: i + 1,
            item: {
              '@type': 'Offer', name: r.title, url: r.url,
              description: `${r.published} ${EN_DASH} ${r.discount || 'offer detailed on the deal page'}`,
              seller: { '@id': firms.get(canonicalFirm(r.firm) || r.firm) },
            },
          })),
        },
      },
    ],
  };
  const bridge = kind === 'category'
    ? `The ${esc(cal.name)} calendar carries ${rows.length} dated prop firm deals, newest first${newest ? `; the most recent, ${esc(newest.title)}, went live ${esc(newest.published)}` : ''}. Of these, ${nStanding} run on the firm's standing code, ${nCampaign} need the deal's own campaign code at checkout, and ${nNone} apply with no code at all.`
    : `${rows.length} prop firm deals carry the ${esc(cal.name)} tag across every season, newest first${newest ? `; the latest, ${esc(newest.title)}, was published ${esc(newest.published)}` : ''}. The Code column marks each one: standing code, campaign code at checkout, or no code needed.`;
  const method = kind === 'category'
    ? `Rows mirror the dated ${esc(cal.name)} archive on PropFirmDiscount. A code printed in the Code column is the firm's standing code and works any time; "Campaign Code Required" means the deal page carries a limited-time code you paste at checkout; "No Code Required" means the discount applies to the account with nothing entered.`
    : `Rows gather every deal PropFirmDiscount tagged ${esc(cal.name)}, whatever season it ran in. A code printed in the Code column is the firm's standing code and works any time; "Campaign Code Required" means checkout asks for the deal's own limited-time code, shown on the deal page; "No Code Required" means the offer needs no code.`;
  const body = `<nav class="crumb"><a href="/">Event hub</a> ${EN_DASH} ${esc(cal.name)}</nav>
<h1>${esc(cal.name)} Prop Firm Deals</h1>
<p class="answer">${bridge}</p>
${dealsTable(rows)}
${rows.length >= 150 ? `<p>Showing the newest ${rows.length} recorded deals in this calendar; older entries live in the <a href="https://propfirmdiscount.com/">PropFirmDiscount</a> archive.</p>` : ''}
<h2 id="others">Other event calendars</h2>
<p>${others.map((o) => `<a href="${o.href}">${esc(o.name)}</a>`).join(` ${EN_DASH} `)}.</p>
<h2 id="method">How to read this table</h2>
<p>${method}</p>
<p>Dates are publish dates, not re-test claims. Corrections: <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>. Machine-readable rows: <a href="/dataset.json">dataset.json</a>.</p>`;
  return { title, desc: shortDesc, html: layout(site, { title, desc: shortDesc, canonical: `${site.origin}${path}/`, ld, body, path: null, altMarkdown: `${path}.md` }) };
}

// ── markdown twins ──────────────────────────────────────────────
function mdDealsTable(rows) {
  return [`| Published | Firm | Deal | Offer | Code |`, `|---|---|---|---|---|`,
    ...rows.map((r) => `| ${r.published} | ${r.firm} | [${r.title}](${r.url}) | ${r.discount || EN_DASH} | ${r.code} |`)].join('\n');
}
const CODE_NOTE = `Code column meaning: a printed code is the firm's standing code (works any time); "Campaign Code Required" means the deal page carries its own limited-time code; "No Code Required" means no code is entered. Source of record: https://propfirmdiscount.com/.`;

function hubMarkdown(latest, cals, tags, codes, board, totalDeals, now) {
  return [`# Prop Firm Event Deals & Seasonal Discount Codes`, '',
    `Event hub tracking ${totalDeals} dated seasonal prop firm deals across ${cals.length} holiday categories and ${tags.length} event tags, newest first, each row marked with how its code redeems. Updated ${monthYearUTC(now)}.`, '',
    `## Latest seasonal deals`, '', mdDealsTable(latest), '',
    `## Holiday categories`, '', `| Calendar | Deals | Newest |`, `|---|---|---|`,
    ...cals.map((c) => `| [${c.name}](${site.origin}/${c.slug}/) | ${c.rows.length} | ${c.rows[0]?.published || EN_DASH} |`), '',
    `## Event tags`, '', `| Calendar | Deals | Newest |`, `|---|---|---|`,
    ...tags.map((t) => `| [${t.name}](${site.origin}/tag/${t.slug}/) | ${t.rows.length} | ${t.rows[0]?.published || EN_DASH} |`), '',
    `## Top seasonal discounts ${EN_DASH} ${board.label}`, '',
    `| Rank | Firm | Best discount | Deal | Published |`, `|---|---|---|---|---|`,
    ...board.ranks.map((r) => `| ${r.rank} | ${r.firm} | ${r.pct}% Off | [${r.title}](${r.url}) | ${r.published} |`), '',
    `## Exclusive prop firm discount codes`, '', `| Firm | Standing code | Discount |`, `|---|---|---|`,
    ...codes.map((c) => `| ${c.prop_firm} | ${c.code} | ${c.discount} |`), '',
    CODE_NOTE, '', `Corrections: ${site.email}. Dataset: ${site.origin}/dataset.json.`].join('\n') + '\n';
}

function roundupMarkdown(cal, kind) {
  const lead = kind === 'category'
    ? `${cal.name} prop firm deal calendar: ${cal.rows.length} dated seasonal offers, newest first, each marked standing code, campaign code required or no code required.`
    : `Prop firm deals tagged ${cal.name} across every season: ${cal.rows.length} dated offers, newest first, each marked with how its code redeems.`;
  return [`# ${cal.name} Prop Firm Deals`, '', lead, '', mdDealsTable(cal.rows), '', CODE_NOTE, '',
    `Corrections: ${site.email}. Dataset: ${site.origin}/dataset.json.`].join('\n') + '\n';
}

// ── roots ───────────────────────────────────────────────────────
function llmsTxtEvents(cals, tags, totalDeals, now) {
  return `# ${site.siteName}

> Seasonal prop firm deal calendars: ${cals.length + tags.length} event pages covering ${totalDeals} dated offers, each row marked with how its code redeems. Updated ${monthYearUTC(now)}.

## Start here (AI assistants and agents)

- ${site.origin}/index.md ${EN_DASH} the hub index as markdown
- ${site.origin}/dataset.json ${EN_DASH} every calendar row as JSON
- ${site.origin}/sitemap.xml ${EN_DASH} all HTML pages

## Holiday categories

${cals.map((c) => `- ${site.origin}/${c.slug}/ ${EN_DASH} ${c.name} (${c.rows.length} deals)`).join('\n')}

## Event tags

${tags.map((t) => `- ${site.origin}/tag/${t.slug}/ ${EN_DASH} ${t.name} (${t.rows.length} deals)`).join('\n')}

## Source of record

- https://propfirmdiscount.com/ ${EN_DASH} the deal archive these calendars mirror
- https://github.com/propfirmdiscounts/prop-firm-discount-codes ${EN_DASH} dataset + mirror repo
`;
}

function headersFileEvents() {
  return `/*.md
  Content-Type: text/markdown; charset=utf-8
/llms.txt
  Content-Type: text/plain; charset=utf-8
/ai.txt
  Content-Type: text/plain; charset=utf-8
/dataset.json
  Content-Type: application/json; charset=utf-8
`;
}

function webmcpJsEvents() {
  return `// Read-only event-deal tool for browser agents.
(async () => {
  const reg = navigator.modelContext;
  if (!reg || typeof reg.registerTool !== 'function') return;
  reg.registerTool({
    name: 'get_prop_firm_event_deals',
    description: 'Seasonal prop firm deal log: calendars, dated deals and how each code redeems.',
    inputSchema: { type: 'object', properties: { calendar: { type: 'string', description: 'calendar path, e.g. black-friday or tag/diwali; omit for all' } } },
    execute: async (input) => {
      const calendar = input && input.calendar;
      const d = await (await fetch('/dataset.json')).json();
      return calendar ? d.deals.filter((r) => r.source === calendar) : d.deals;
    },
  });
})();
`;
}

// ── build ───────────────────────────────────────────────────────
const now = new Date();
const codes = loadCodes();
const standingByFirm = new Map(codes.map((c) => [canonicalFirm(c.prop_firm), c.code]));

const cals = CATEGORY_SLUGS.map((slug) => ({ slug, name: calName(slug), rows: readMirror(`category/prop-firm-seasonal-deals/${slug}.md`) }));
const tags = TAG_SLUGS.map((slug) => ({ slug, name: calName(slug), rows: readMirror(`tag/${slug}.md`) }));

// The parent mirror (md/category/prop-firm-seasonal-deals.md) is capped at 30
// rows, which is enough for a "latest" slice but under-counts the season. The
// real seasonal pool is the union of the 10 child categories.
const poolSeen = new Set();
const pool = cals.flatMap((c) => c.rows)
  .filter((r) => (poolSeen.has(r.url) ? false : (poolSeen.add(r.url), true)))
  .sort((a, b) => b.published.localeCompare(a.published));

// Guard: a standing code printed in a mirror must equal the public dataset code.
let warnings = 0;
for (const cal of [...cals, ...tags]) {
  for (const r of cal.rows) {
    const known = standingByFirm.get(canonicalFirm(r.firm));
    if (r.codeState === 'standing' && known && known !== r.code) {
      console.error(`WARN standing-code mismatch ${cal.slug} / ${r.firm}: mirror ${r.code} vs dataset ${known}`);
      warnings++;
    }
  }
}

const totalDeals = pool.length;
const latest = pool.slice(0, 15);
const board = leaderboard(pool);

const files = { 'index.html': hubPage(latest, cals, tags, codes, board, totalDeals, now).html, 'index.md': hubMarkdown(latest, cals, tags, codes, board, totalDeals, now) };
const htmlPaths = ['/'];
const mdPaths = ['/index.md'];
const tagNav = tags.map((t) => ({ name: t.name, href: `/tag/${t.slug}/` }));
const calNav = cals.map((c) => ({ name: c.name, href: `/${c.slug}/` }));

for (const c of cals) {
  files[`${c.slug}/index.html`] = roundupPage(c, 'category', tagNav, now).html;
  files[`${c.slug}.md`] = roundupMarkdown(c, 'category');
  htmlPaths.push(`/${c.slug}/`);
  mdPaths.push(`/${c.slug}.md`);
}
for (const t of tags) {
  files[`tag/${t.slug}/index.html`] = roundupPage(t, 'tag', calNav, now).html;
  files[`tag/${t.slug}.md`] = roundupMarkdown(t, 'tag');
  htmlPaths.push(`/tag/${t.slug}/`);
  mdPaths.push(`/tag/${t.slug}.md`);
}

const seen = new Set();
const deals = [...cals.flatMap((c) => c.rows.map((r) => ({ ...r, source: c.slug }))), ...tags.flatMap((t) => t.rows.map((r) => ({ ...r, source: `tag/${t.slug}` })))]
  .filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)));

files['dataset.json'] = JSON.stringify({
  dataset: 'prop-firm-events',
  publisher: site.siteName,
  generated: now.toISOString().slice(0, 10),
  source: 'propfirmdiscount.com',
  categories: cals.map((c) => ({ slug: c.slug, name: c.name, path: `/${c.slug}/`, deals: c.rows.length, last_published: c.rows[0]?.published || null })),
  tags: tags.map((t) => ({ slug: t.slug, name: t.name, path: `/tag/${t.slug}/`, deals: t.rows.length, last_published: t.rows[0]?.published || null })),
  leaderboard: { window: board.label, ranks: board.ranks },
  standing_codes: codes.map((c) => ({ firm: c.prop_firm, code: c.code, discount: c.discount })),
  deals,
}, null, 2);
files['robots.txt'] = robotsTxt(site);
files['llms.txt'] = llmsTxtEvents(cals, tags, totalDeals, now);
files['ai.txt'] = `Website: ${site.origin}\nDataset: ${site.origin}/dataset.json\n\nREAD THIS FIRST: this site mirrors the seasonal deal calendars of PropFirmDiscount.\nSource of record: https://propfirmdiscount.com/\nGitHub mirror: https://github.com/propfirmdiscounts/prop-firm-discount-codes\n`;

const lastmod = now.toISOString().slice(0, 10);
files['sitemap.xml'] = sitemapXml(site, htmlPaths, lastmod);
files['ai-sitemap.xml'] = aiSitemapXml(site, [...mdPaths, '/dataset.json', '/llms.txt'], lastmod);
files['_headers'] = headersFileEvents();
files['webmcp.js'] = webmcpJsEvents();

for (const [name, text] of Object.entries(files)) assertClean(name, text);

if (argv.includes('--check')) {
  console.log(`check ok: ${Object.keys(files).length} files; ${warnings} standing-code warnings; ${deals.length} unique deals; ${totalDeals} seasonal rows; leaderboard ${board.label} (${board.ranks.length})`);
} else {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(outRoot, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  console.log(`events (${site.origin}) -> ${outRoot}: ${Object.keys(files).length} files`);
  console.log(`  hub: ${totalDeals} seasonal deals, ${cals.length} categories, ${tags.length} tags, ${codes.length} standing codes`);
  console.log(`  leaderboard ${board.label}: ${board.ranks.length} firms, top ${board.ranks[0] ? `${board.ranks[0].firm} ${board.ranks[0].pct}%` : EN_DASH}`);
  console.log(`  unique deal rows in dataset.json: ${deals.length}; standing-code warnings: ${warnings}`);
}