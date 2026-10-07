// Prop Firm Event Hub — static demo builder (local only).
// Reads only the markdown mirrors + the public codes dataset from this repo;
// never touches the database. Mirrors are refreshed hourly by sync.yml, so the
// demo is byte-for-byte downstream of prod.
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc, EN_DASH, monthYearUTC, layout, DISCLOSURE, robotsTxt, sitemapXml,
  aiSitemapXml, assertClean, publisherOrg, webManifest,
} from '../satellites/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (k) => (argv.indexOf(k) >= 0 ? resolve(argv[argv.indexOf(k) + 1]) : null);
const repoRoot = argOf('--root') || resolve(here, '../..');
const outRoot = argOf('--out') || join(here, 'dist');

// ── event registry ───────────────────────────────────────────
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
const EVENT_NAMES = {
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
const eventName = (slug) => EVENT_NAMES[slug] || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
// Short label drops the redundant " Deals" suffix ("Halloween Deals" → "Halloween").
const shortName = (slug) => eventName(slug).replace(/\s+Deals$/, '');

const site = {
  id: 'events',
  siteName: 'Prop Firm Event Hub',
  shortName: 'PF Events',
  tagline: EN_DASH + ' seasonal event deal tracker',
  origin: (process.env.SATELLITE_ORIGIN_EVENTS || 'https://propfirmevent.example').replace(/\/$/, ''),
  icons: true,
  disclosure: DISCLOSURE,
};
site.email = `hello@${site.origin.replace(/^https?:\/\//, '')}`;

// Hub tables carry more columns than the satellite layout expects, and the
// base sheet nowraps columns 4-5 (which lands on Deal and/or Code here).
// `table.fixed` keeps the widths from being overridden by long titles; the
// nth-child overrides below sit after the base rules so they win and let the
// Deal column absorb the slack while Code stays narrow enough for
// "Campaign Code Required" to wrap.
const EVENTS_CSS = `table.fixed{table-layout:fixed}
table.fixed td,table.fixed th{overflow-wrap:anywhere}
table.deals6 th:nth-child(1),table.deals6 td:nth-child(1){width:11%}
table.deals6 th:nth-child(2),table.deals6 td:nth-child(2){width:12%}
table.deals6 th:nth-child(3),table.deals6 td:nth-child(3){width:13%}
table.deals6 th:nth-child(4),table.deals6 td:nth-child(4){white-space:normal}
table.deals6 th:nth-child(5),table.deals6 td:nth-child(5){width:10%}
table.deals6 th:nth-child(6),table.deals6 td:nth-child(6){width:12%;white-space:normal;overflow-wrap:anywhere}
table.deals5 th:nth-child(1),table.deals5 td:nth-child(1){width:12%}
table.deals5 th:nth-child(2),table.deals5 td:nth-child(2){width:16%}
table.deals5 th:nth-child(3),table.deals5 td:nth-child(3){white-space:normal}
table.deals5 th:nth-child(4),table.deals5 td:nth-child(4){width:12%}
table.deals5 th:nth-child(5),table.deals5 td:nth-child(5){width:13%;white-space:normal;overflow-wrap:anywhere}
table.events th:nth-child(2),table.events td:nth-child(2){width:12%;text-align:right}
table.events th:nth-child(3),table.events td:nth-child(3){width:24%}
table.board td:nth-child(1){font-weight:400}
table.board td:nth-child(3){font-weight:600}
table.board th:nth-child(1),table.board td:nth-child(1){width:6%}
table.board th:nth-child(2),table.board td:nth-child(2){width:12%}
table.board th:nth-child(3),table.board td:nth-child(3){width:13%}
table.board th:nth-child(5),table.board td:nth-child(5){white-space:normal}
table.board th:nth-child(6),table.board td:nth-child(6){width:11%;white-space:normal;overflow-wrap:anywhere}
table.board th:nth-child(7),table.board td:nth-child(7){width:12%}
table.exclusive td:nth-child(4){white-space:nowrap}
table.firms th:nth-child(1),table.firms td:nth-child(1){font-weight:600}
table.firms th:nth-child(2),table.firms td:nth-child(2){width:14%}
table.firms th:nth-child(3),table.firms td:nth-child(3){width:10%;text-align:right}
table.firms th:nth-child(4),table.firms td:nth-child(4){width:16%}
table.firms th:nth-child(5),table.firms td:nth-child(5){width:16%;white-space:normal;overflow-wrap:anywhere}`;

// Spaceholder artwork: a tab icon must resolve even before the real files
// land in tools/events/assets/events/. Any real favicon.svg dropped there
// takes over automatically on the next build.
const PLACEHOLDER_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Prop Firm Event Hub">
<rect width="64" height="64" rx="12" fill="#0a5"/>
<text x="32" y="42" font-family="system-ui,sans-serif" font-size="30" font-weight="700" fill="#fff" text-anchor="middle">E</text>
</svg>
`;

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

// Tag every parsed row with the event it came from so the hub's latest
// table can show an Event column.
const readMirror = (rel, eventShort) => {
  const p = join(repoRoot, 'md', rel);
  if (!existsSync(p)) return [];
  return parseEventMirror(readFileSync(p, 'utf8')).map((r) => ({ ...r, eventShort }));
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
// A real code renders as <code>; the two "no usable code" states render as
// plain text. The cell always carries data-code-state so a machine reader can
// tell a genuine code ("standing") from the two labels without guessing.
const codeCell = (r) => (r.codeState === 'standing' ? `<code>${esc(r.code)}</code>` : esc(r.code));
const codeTd = (r) => `<td data-code-state="${r.codeState}">${codeCell(r)}</td>`;

function dealsTable(rows, withEvent) {
  const head = withEvent
    ? `<th scope="col">Published</th><th scope="col">Event</th><th scope="col">Firm</th><th scope="col">Deal</th><th scope="col">Discount</th><th scope="col">Code</th>`
    : `<th scope="col">Published</th><th scope="col">Firm</th><th scope="col">Deal</th><th scope="col">Discount</th><th scope="col">Code</th>`;
  return `<table class="checks fixed ${withEvent ? 'deals6' : 'deals5'}">
<thead><tr>${head}</tr></thead>
<tbody>
${rows.map((r) => `<tr><td><time datetime="${esc(r.published)}">${esc(r.published)}</time></td>${withEvent ? `<td>${esc(r.eventShort || EN_DASH)}</td>` : ''}<td>${esc(r.firm || EN_DASH)}</td><td><a rel="nofollow" href="${esc(r.url)}">${esc(r.title)}</a></td><td>${esc(r.discount || EN_DASH)}</td>${codeTd(r)}</tr>`).join('\n')}
</tbody>
</table>`;
}

// Term pages split the deal table by year once an event spans more than one,
// so a reader landing on a returning event sees the current run first instead
// of scrolling past last year's. Single-year events keep the bare table —
// a lone "2026" heading would only repeat the year already in the H1.
// `rows` arrives newest-first, so the year keys come out newest-first too.
function dealsByYear(rows) {
  const years = [...new Set(rows.map((r) => r.published.slice(0, 4)))];
  if (years.length <= 1) return dealsTable(rows);
  return years.map((y) => `<h3>${y}</h3>\n${dealsTable(rows.filter((r) => r.published.startsWith(y)))}`).join('\n');
}

// One combined table for both event groups. Rows sort newest-first by their
// most recent deal so the driest events sink to the bottom.
function eventTable(items) {
  const sorted = [...items].sort((a, b) => String(b.rows[0]?.published || '').localeCompare(String(a.rows[0]?.published || '')));
  return `<table class="checks events fixed">
<thead><tr><th scope="col">Event &amp; holiday</th><th scope="col">Deals</th><th scope="col">Newest</th></tr></thead>
<tbody>
${sorted.map(({ name, href, rows }) => `<tr><td><a href="${href}">${esc(name)}</a></td><td>${rows.length}</td><td>${rows[0] ? `<time datetime="${esc(rows[0].published)}">${esc(rows[0].published)}</time>` : EN_DASH}</td></tr>`).join('\n')}
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
    .map(([firm, v], i) => ({ rank: i + 1, firm, pct: v.pct, title: v.row.title, url: v.row.url, published: v.row.published, code: v.row.code, codeState: v.row.codeState, eventShort: v.row.eventShort || '' }));
  return { label, windowed: windowed.length > 0, ranks };
}

// ── JSON-LD helpers ─────────────────────────────────────────────
const webSiteNode = () => ({ '@type': 'WebSite', '@id': `${site.origin}/#website`, url: site.origin, name: site.siteName, publisher: { '@id': `${site.origin}/#org` } });
const firmId = (name) => `${site.origin}/#firm-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

// Per-firm rollup so a term page answers a firm-specific long tail
// ("{firm} {event} discount") without the reader scanning the whole table.
function firmRollup(rows) {
  const agg = new Map();
  for (const r of rows) {
    const name = canonicalFirm(r.firm);
    if (!name) continue;
    const p = pctOf(r.discount);
    const cur = agg.get(name) || { name, count: 0, best: null, bestRow: r, latest: r };
    cur.count++;
    if (p !== null && (cur.best === null || p > cur.best)) { cur.best = p; cur.bestRow = r; }
    if (r.published > cur.latest.published) cur.latest = r;
    agg.set(name, cur);
  }
  return [...agg.values()]
    .sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.name.localeCompare(b.name))
    .slice(0, 40);
}

// ── homepage ────────────────────────────────────────────────────
function hubPage(latest, events, tags, codes, board, totalDeals, now) {
  // Year stamp follows the newest seasonal deal on record, so a stale event
  // never advertises the current year.
  const year = latest[0] ? latest[0].published.slice(0, 4) : now.getUTCFullYear();
  const title = `Prop Firm Event Deals & Seasonal Discount Codes ${year}`;
  const desc = `Event hub tracking ${totalDeals} dated seasonal prop firm deals across ${events.length} holiday categories and ${tags.length} event tags, newest first, each row marked with how its code redeems. Updated ${monthYearUTC(now)}.`.slice(0, 300);
  const pages = [...events.map((c) => ({ slug: c.slug, name: c.name, href: `/${c.slug}/` })), ...tags.map((t) => ({ slug: t.slug, name: t.name, href: `/${t.slug}/` }))];
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      webSiteNode(), publisherOrg(site),
      {
        '@type': 'CollectionPage', '@id': `${site.origin}/`, url: `${site.origin}/`, name: title, description: desc,
        dateModified: now.toISOString().slice(0, 10), isPartOf: { '@id': `${site.origin}/#website` },
        inLanguage: 'en',
        author: { '@id': `${site.origin}/#org` }, publisher: { '@id': `${site.origin}/#org` },
        about: { '@type': 'Thing', name: 'Seasonal prop firm promotions and discount codes' },
        mainEntity: {
          '@type': 'ItemList', numberOfItems: pages.length,
          itemListOrder: 'https://schema.org/ItemListUnordered',
          itemListElement: pages.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site.origin}${p.href}`, name: `${p.name} prop firm discount code` })),
        },
      },
    ],
  };
  const boardTable = board.ranks.length ? `<table class="checks board fixed">
<thead><tr><th scope="col">Rank</th><th scope="col">Event</th><th scope="col">Firm</th><th scope="col">Best discount</th><th scope="col">Deal</th><th scope="col">Code</th><th scope="col">Published</th></tr></thead>
<tbody>
${board.ranks.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.eventShort || EN_DASH)}</td><td>${esc(r.firm)}</td><td>${r.pct}% Off</td><td><a rel="nofollow" href="${esc(r.url)}">${esc(r.title)}</a></td>${codeTd(r)}<td><time datetime="${esc(r.published)}">${esc(r.published)}</time></td></tr>`).join('\n')}
</tbody>
</table>` : '<p>No percentage offers are on record for the current window yet.</p>';
  const body = `<h1>Prop Firm Event Deals &amp; Seasonal Discount Codes ${year}</h1>
<p class="answer">This hub tracks ${totalDeals} dated seasonal deals from proprietary trading firms across ${events.length} holiday categories and ${tags.length} event tags, newest first. Every row states how the offer redeems: the firm's standing code, a campaign code entered at checkout, or no code at all.${board.ranks.length ? ` The deepest cut in the ${esc(board.label)} window is ${board.ranks[0].pct}% off from ${esc(board.ranks[0].firm)}.` : ''}</p>

<h2 id="latest">Latest seasonal deals</h2>
${dealsTable(latest, true)}

<h2 id="events">Event &amp; holiday pages</h2>
<p>Ten holiday categories and ${tags.length} event tags, each with its own tracked deal history, newest deal first. Pick a season to see every offer recorded under it.</p>
${eventTable([...events.map((c) => ({ name: c.short, href: `/${c.slug}/`, rows: c.rows })), ...tags.map((t) => ({ name: t.short, href: `/${t.slug}/`, rows: t.rows }))])}

<h2 id="leaderboard">Top seasonal discounts ${EN_DASH} ${esc(board.label)}</h2>
<p>The ten firms with the deepest percentage offer among seasonal deals published in the most recent active months${board.windowed ? '' : ' on record'}. Ranking uses each firm's best single deal in the window; ties break on publish date.</p>
${boardTable}

<h2 id="codes">Exclusive prop firm discount codes</h2>
<p>These are the firms' exclusive standing codes: they work any time, inside or outside an event window. Listed as plain text on purpose ${EN_DASH} copy the code straight from the table, no click needed.</p>
<table class="checks exclusive fixed">
<thead><tr><th scope="col">Prop Firm</th><th scope="col">Exclusive code</th><th scope="col">Discount</th><th scope="col">Checked</th></tr></thead>
<tbody>
${codes.map((c) => `<tr><td>${esc(c.prop_firm)}</td><td><code>${esc(c.code)}</code></td><td>${esc(c.discount)}</td><td>${esc(monthYearUTC(now))}</td></tr>`).join('\n')}
</tbody>
</table>
<p>Looking for the verification trail behind each code, with the dated deals it applied to? See the firm pages on <a href="https://propfirmdiscount.com/">PropFirmDiscount</a>, or the machine-readable <a href="/dataset.json">dataset.json</a>.</p>

<h2 id="method">About this hub and how the code column works</h2>
<p>${esc(site.siteName)} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022. Every event page mirrors the dated deal archive on <a href="https://propfirmdiscount.com/">propfirmdiscount.com</a>, refreshed hourly.</p>
<p>Reading the Code column: a <code>monospaced value</code> is the firm's standing exclusive code and the deal redeems on it any time; the plain-text "Campaign Code Required" means the deal carries its own limited-time code, which you copy from the deal page the row links to; "No Code Required" means the offer applies to the account without entering anything.</p>
<p>A row's date is the day the firm's deal went live ${EN_DASH} it is a publish date, not a claim that the offer was re-tested that day. Corrections welcome: email <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> and the page updates in the next rebuild. Machine readers: <a href="/dataset.json">dataset.json</a> carries every row, <a href="/llms.txt">llms.txt</a> maps the site.</p>`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}/`, ld, body, path: null, altMarkdown: '/md', extraCss: EVENTS_CSS }) };
}

// ── event (roundup) page ─────────────────────────────────────
function roundupPage(ev, kind, others, now) {
  const rows = ev.rows;
  const newest = rows[0] || null;
  const nStanding = rows.filter((r) => r.codeState === 'standing').length;
  const nCampaign = rows.filter((r) => r.codeState === 'campaign').length;
  const nNone = rows.filter((r) => r.codeState === 'none').length;
  // Every event — holiday category or event tag — lives at the site root,
  // so no event ever needs a /tag/ prefix.
  const path = `/${ev.slug}`;
  // Year stamp follows this event's newest deal, matching the hub: an event
  // whose latest entry is from an earlier year never claims the current one.
  const year = newest ? newest.published.slice(0, 4) : now.getUTCFullYear();
  const h1 = `${ev.name} Prop Firm Discount Code ${year}`;
  const title = h1;
  const desc = (kind === 'category'
    ? `${ev.name} prop firm discount codes: ${rows.length} dated seasonal offers from the firms running ${ev.name} promotions, newest first, each marked standing code, campaign code required or no code required.`
    : `${ev.name} prop firm discount codes: ${rows.length} dated offers from every firm tagged ${ev.name}, newest first, each marked with how its code redeems.`) + ` Updated ${monthYearUTC(now)}.`;
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
        '@type': 'BreadcrumbList', '@id': `${site.origin}${path}/#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Prop firm event deals', item: `${site.origin}/` },
          { '@type': 'ListItem', position: 2, name: h1, item: `${site.origin}${path}/` },
        ],
      },
      {
        '@type': 'CollectionPage', '@id': `${site.origin}${path}/`, url: `${site.origin}${path}/`, name: title, description: shortDesc,
        dateModified: now.toISOString().slice(0, 10), isPartOf: { '@id': `${site.origin}/#website` },
        inLanguage: 'en',
        author: { '@id': `${site.origin}/#org` }, publisher: { '@id': `${site.origin}/#org` },
        breadcrumb: { '@id': `${site.origin}${path}/#breadcrumb` },
        about: { '@type': 'Thing', name: ev.name },
        mainEntity: {
          '@type': 'ItemList', numberOfItems: rows.length,
          itemListOrder: 'https://schema.org/ItemListOrderDescending',
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
    ? `This page tracks ${rows.length} dated ${esc(ev.name)} prop firm discount codes, newest first${newest ? `; the most recent, ${esc(newest.title)}, went live ${esc(newest.published)}` : ''}. Of these, ${nStanding} run on the firm's standing code, ${nCampaign} need the deal's own campaign code at checkout, and ${nNone} apply with no code at all.`
    : `${rows.length} prop firm discount codes carry the ${esc(ev.name)} tag across every season, newest first${newest ? `; the latest, ${esc(newest.title)}, was published ${esc(newest.published)}` : ''}. The Code column marks each one: standing code, campaign code at checkout, or no code needed.`;
  const method = kind === 'category'
    ? `Rows mirror the dated ${esc(ev.name)} archive on PropFirmDiscount. A <code>monospaced value</code> is the firm's standing exclusive code and works any time; the plain-text "Campaign Code Required" means the deal carries its own limited-time code, which you copy from the deal page the row links to; "No Code Required" means the discount applies with nothing entered.`
    : `Rows gather every deal PropFirmDiscount tagged ${esc(ev.name)}, whatever season it ran in. A <code>monospaced value</code> is the firm's standing exclusive code and works any time; the plain-text "Campaign Code Required" means the deal carries its own limited-time code, which you copy from the deal page the row links to; "No Code Required" means the offer needs no code.`;
  // Per-firm rollup so the page answers a firm-specific long tail without the
  // reader scanning the whole table.
  const firmRows = firmRollup(rows);
  const firmSection = firmRows.length ? `<h2 id="firms">${esc(ev.name)} discount code by firm</h2>
<p>Every firm with a ${esc(ev.name)} offer on record, deepest cut first. The code shown is the one that firm's best ${esc(ev.name)} offer used.</p>
<table class="checks firms fixed">
<thead><tr><th scope="col">Firm</th><th scope="col">Best discount</th><th scope="col">Deals</th><th scope="col">Latest</th><th scope="col">Code</th></tr></thead>
<tbody>
${firmRows.map((f) => `<tr><td>${esc(f.name)}</td><td>${f.best === null ? EN_DASH : `${f.best}% Off`}</td><td>${f.count}</td><td><time datetime="${esc(f.latest.published)}">${esc(f.latest.published)}</time></td><td data-code-state="${f.bestRow.codeState}">${codeCell(f.bestRow)}</td></tr>`).join('\n')}
</tbody>
</table>` : '';
  const body = `<nav class="crumb"><a href="/">Event hub</a> ${EN_DASH} ${esc(ev.name)}</nav>
<h1>${esc(h1)}</h1>
<p class="answer">${bridge}</p>
${dealsByYear(rows)}
${rows.length >= 150 ? `<p>Showing the newest ${rows.length} recorded deals here; older entries live in the <a href="https://propfirmdiscount.com/">PropFirmDiscount</a> archive.</p>` : ''}
${firmSection}
<h2 id="others">Other events &amp; holidays</h2>
<p>${others.map((o) => `<a href="${o.href}">${esc(o.name)}</a>`).join(` ${EN_DASH} `)}.</p>
<h2 id="method">How to read this table</h2>
<p>${method}</p>
<p>${esc(site.siteName)} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022. This page was last rebuilt ${esc(monthYearUTC(now))}; every row mirrors the dated deal archive on <a href="https://propfirmdiscount.com/">propfirmdiscount.com</a>.</p>
<p>Dates are publish dates, not re-test claims. Corrections: <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>. Machine-readable rows: <a href="/dataset.json">dataset.json</a>.</p>`;
  return { title, desc: shortDesc, html: layout(site, { title, desc: shortDesc, canonical: `${site.origin}${path}/`, ld, body, path: null, altMarkdown: `${path}.md`, extraCss: EVENTS_CSS }) };
}

// ── markdown twins ──────────────────────────────────────────────
function mdDealsTable(rows, withEvent) {
  const head = withEvent
    ? [`| Published | Event | Firm | Deal | Discount | Code |`, `|---|---|---|---|---|---|`]
    : [`| Published | Firm | Deal | Discount | Code |`, `|---|---|---|---|---|`];
  return [...head,
    ...rows.map((r) => `| ${r.published} | ${withEvent ? `${r.eventShort || EN_DASH} | ` : ''}${r.firm || EN_DASH} | [${r.title}](${r.url}) | ${r.discount || EN_DASH} | ${r.code} |`)].join('\n');
}
const CODE_NOTE = `Code column meaning: a standing code shown as a value works any time; the plain-text "Campaign Code Required" means the deal has its own limited-time code, which you copy from the deal page the row links to; "No Code Required" means the offer applies with nothing entered. Source of record: https://propfirmdiscount.com/.`;

// Mirror of dealsByYear for the markdown twin: same years, `###` headings.
function mdDealsByYear(rows) {
  const years = [...new Set(rows.map((r) => r.published.slice(0, 4)))];
  if (years.length <= 1) return mdDealsTable(rows);
  return years.map((y) => `### ${y}\n\n${mdDealsTable(rows.filter((r) => r.published.startsWith(y)))}`).join('\n\n');
}

function hubMarkdown(latest, events, tags, codes, board, totalDeals, now) {
  const year = latest[0] ? latest[0].published.slice(0, 4) : now.getUTCFullYear();
  return [`# Prop Firm Event Deals & Seasonal Discount Codes ${year}`, '',
    `Event hub tracking ${totalDeals} dated seasonal prop firm deals across ${events.length} holiday categories and ${tags.length} event tags, newest first, each row marked with how its code redeems. Updated ${monthYearUTC(now)}.`, '',
    `## Latest seasonal deals`, '', mdDealsTable(latest, true), '',
    `## Event & holiday pages`, '', `| Event & holiday | Deals | Newest |`, `|---|---|---|`,
    ...[...events.map((c) => ({ name: c.short, href: `${site.origin}/${c.slug}/`, rows: c.rows })), ...tags.map((t) => ({ name: t.short, href: `${site.origin}/${t.slug}/`, rows: t.rows }))]
      .sort((a, b) => String(b.rows[0]?.published || '').localeCompare(String(a.rows[0]?.published || '')))
      .map((e) => `| [${e.name}](${e.href}) | ${e.rows.length} | ${e.rows[0]?.published || EN_DASH} |`), '',
    `## Top seasonal discounts ${EN_DASH} ${board.label}`, '',
    `| Rank | Event | Firm | Best discount | Deal | Code | Published |`, `|---|---|---|---|---|---|---|`,
    ...board.ranks.map((r) => `| ${r.rank} | ${r.eventShort || EN_DASH} | ${r.firm} | ${r.pct}% Off | [${r.title}](${r.url}) | ${r.code} | ${r.published} |`), '',
    `## Exclusive prop firm discount codes`, '', `| Prop Firm | Exclusive code | Discount | Checked |`, `|---|---|---|---|`,
    ...codes.map((c) => `| ${c.prop_firm} | ${c.code} | ${c.discount} | ${monthYearUTC(now)} |`), '',
    CODE_NOTE, '', `Corrections: ${site.email}. Dataset: ${site.origin}/dataset.json.`].join('\n') + '\n';
}

function roundupMarkdown(ev, kind) {
  const lead = kind === 'category'
    ? `${ev.name} prop firm discount codes: ${ev.rows.length} dated seasonal offers, newest first, each marked standing code, campaign code required or no code required.`
    : `${ev.name} prop firm discount codes across every firm tagged ${ev.name}: ${ev.rows.length} dated offers, newest first, each marked with how its code redeems.`;
  const firms = firmRollup(ev.rows);
  const year = ev.rows[0] ? ev.rows[0].published.slice(0, 4) : '';
  return [`# ${ev.name} Prop Firm Discount Code${year ? ` ${year}` : ''}`, '', lead, '', mdDealsByYear(ev.rows), '',
    ...(firms.length ? [`## ${ev.name} discount code by firm`, '', `| Firm | Best discount | Deals | Latest | Code |`, `|---|---|---|---|---|`,
      ...firms.map((f) => `| ${f.name} | ${f.best === null ? EN_DASH : `${f.best}% Off`} | ${f.count} | ${f.latest.published} | ${f.bestRow.code} |`), ''] : []),
    CODE_NOTE, '', `Corrections: ${site.email}. Dataset: ${site.origin}/dataset.json.`].join('\n') + '\n';
}

// ── roots ───────────────────────────────────────────────────────
function llmsTxtEvents(events, tags, totalDeals, now) {
  return `# ${site.siteName}

> Seasonal prop firm event deal tracker: ${events.length + tags.length} event pages covering ${totalDeals} dated offers, each row marked with how its code redeems. Updated ${monthYearUTC(now)}.

## Start here (AI assistants and agents)

- ${site.origin}/md ${EN_DASH} the hub index as markdown
- ${site.origin}/dataset.json ${EN_DASH} every deal row as JSON
- ${site.origin}/sitemap.xml ${EN_DASH} all HTML pages

## Event & holiday pages

${[...events, ...tags].map((c) => `- ${site.origin}/${c.slug}/ ${EN_DASH} ${c.name} (${c.rows.length} deals)`).join('\n')}

## Source of record

- https://propfirmdiscount.com/ ${EN_DASH} the deal archive these pages mirror
- https://github.com/propfirmdiscounts/prop-firm-discount-codes ${EN_DASH} dataset + mirror repo
`;
}

function headersFileEvents() {
  return `/md
  Content-Type: text/markdown; charset=utf-8
/*.md
  Content-Type: text/markdown; charset=utf-8
/site.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
/favicon.svg
  Content-Type: image/svg+xml
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
    description: 'Seasonal prop firm event deal tracker: event pages, dated deals and how each code redeems.',
    inputSchema: { type: 'object', properties: { event: { type: 'string', description: 'event slug, e.g. black-friday or diwali; omit for all' } } },
    execute: async (input) => {
      const event = input && input.event;
      const d = await (await fetch('/dataset.json')).json();
      return event ? d.deals.filter((r) => r.source === event) : d.deals;
    },
  });
})();
`;
}

// ── build ───────────────────────────────────────────────────────
const now = new Date();
const codes = loadCodes();
const standingByFirm = new Map(codes.map((c) => [canonicalFirm(c.prop_firm), c.code]));

const events = CATEGORY_SLUGS.map((slug) => ({ slug, name: eventName(slug), short: shortName(slug), kind: 'category', rows: readMirror(`category/prop-firm-seasonal-deals/${slug}.md`, shortName(slug)) }));
const tags = TAG_SLUGS.map((slug) => ({ slug, name: eventName(slug), short: shortName(slug), kind: 'tag', rows: readMirror(`tag/${slug}.md`, shortName(slug)) }));

// The parent mirror (md/category/prop-firm-seasonal-deals.md) is capped at 30
// rows, which is enough for a "latest" slice but under-counts the season. The
// real seasonal pool is the union of the 10 child categories.
// Build the seasonal pool from the 10 child categories, then relabel each row
// with the tag whose short name matches the deal title (tags are the sharper
// signal — a Labor Day deal sits in the Festive Anniversary category, but the
// tag name is what a reader expects to see in the Event column).
const tagByShort = new Map(tags.map((t) => [t.short.toLowerCase(), t.short]));
const poolSeen = new Set();
const pool = events.flatMap((c) => c.rows)
  .filter((r) => (poolSeen.has(r.url) ? false : (poolSeen.add(r.url), true)))
  .map((r) => {
    const hit = [...tagByShort.keys()].find((s) => r.title.toLowerCase().includes(s));
    return hit ? { ...r, eventShort: tagByShort.get(hit) } : r;
  })
  .sort((a, b) => b.published.localeCompare(a.published));

// Guard: a standing code printed in a mirror must equal the public dataset code.
let warnings = 0;
for (const ev of [...events, ...tags]) {
  for (const r of ev.rows) {
    const known = standingByFirm.get(canonicalFirm(r.firm));
    if (r.codeState === 'standing' && known && known !== r.code) {
      console.error(`WARN standing-code mismatch ${ev.slug} / ${r.firm}: mirror ${r.code} vs dataset ${known}`);
      warnings++;
    }
  }
}

const totalDeals = pool.length;
const latest = pool.slice(0, 15);
const board = leaderboard(pool);

const files = { 'index.html': hubPage(latest, events, tags, codes, board, totalDeals, now).html, md: hubMarkdown(latest, events, tags, codes, board, totalDeals, now) };
const htmlPaths = ['/'];
const mdPaths = ['/md'];
// Every event sits at the site root, so each page cross-links to all the
// others, minus itself.
const allNav = [...events, ...tags].map((c) => ({ slug: c.slug, name: c.name, href: `/${c.slug}/` }));
const navFor = (slug) => allNav.filter((o) => o.slug !== slug);

for (const c of events) {
  files[`${c.slug}/index.html`] = roundupPage(c, 'category', navFor(c.slug), now).html;
  files[`${c.slug}.md`] = roundupMarkdown(c, 'category');
  htmlPaths.push(`/${c.slug}/`);
  mdPaths.push(`/${c.slug}.md`);
}
for (const t of tags) {
  files[`${t.slug}/index.html`] = roundupPage(t, 'tag', navFor(t.slug), now).html;
  files[`${t.slug}.md`] = roundupMarkdown(t, 'tag');
  htmlPaths.push(`/${t.slug}/`);
  mdPaths.push(`/${t.slug}.md`);
}

const seen = new Set();
// Each deal carries an explicit code_state so a machine reader never has to
// tell a real code from the two "no usable code" labels by string matching.
// `code` is the redeemable value only when code_state is "standing"; for the
// other two states it is the human-readable label, kept for display parity.
const deals = [...events.flatMap((c) => c.rows.map((r) => ({ ...r, source: c.slug }))), ...tags.flatMap((t) => t.rows.map((r) => ({ ...r, source: t.slug })))]
  .filter((d) => (seen.has(d.url) ? false : (seen.add(d.url), true)))
  .map((d) => ({
    published: d.published,
    event: d.eventShort || null,
    firm: d.firm || null,
    deal: d.title,
    url: d.url,
    discount: d.discount || null,
    code_state: d.codeState,
    code: d.codeState === 'standing' ? d.code : null,
    code_label: d.codeState === 'standing' ? null : d.code,
    source: d.source,
  }));

files['dataset.json'] = JSON.stringify({
  dataset: 'prop-firm-events',
  publisher: site.siteName,
  generated: now.toISOString().slice(0, 10),
  source: 'propfirmdiscount.com',
  code_state_note: 'code_state "standing" means code holds a redeemable standing code; "campaign" means a limited-time code is on the deal page (see url); "none" means no code is needed. code is null unless code_state is "standing".',
  categories: events.map((c) => ({ slug: c.slug, name: c.name, path: `/${c.slug}/`, deals: c.rows.length, last_published: c.rows[0]?.published || null })),
  tags: tags.map((t) => ({ slug: t.slug, name: t.name, path: `/${t.slug}/`, deals: t.rows.length, last_published: t.rows[0]?.published || null })),
  leaderboard: { window: board.label, ranks: board.ranks.map(({ codeState, ...r }) => r) },
  standing_codes: codes.map((c) => ({ firm: c.prop_firm, code: c.code, discount: c.discount })),
  deals,
}, null, 2);
files['robots.txt'] = robotsTxt(site);
files['llms.txt'] = llmsTxtEvents(events, tags, totalDeals, now);
files['ai.txt'] = `Website: ${site.origin}\nDataset: ${site.origin}/dataset.json\n\nREAD THIS FIRST: this site mirrors the seasonal prop firm event deals of PropFirmDiscount.\nSource of record: https://propfirmdiscount.com/\nGitHub mirror: https://github.com/propfirmdiscounts/prop-firm-discount-codes\n`;

const lastmod = now.toISOString().slice(0, 10);
files['sitemap.xml'] = sitemapXml(site, htmlPaths, lastmod);
files['ai-sitemap.xml'] = aiSitemapXml(site, [...mdPaths, '/dataset.json', '/llms.txt'], lastmod);
files['_headers'] = headersFileEvents();
files['webmcp.js'] = webmcpJsEvents();
// Icons are binary and live outside the text builders, exactly as the
// satellites do it: tools/events/assets/events/ is copied verbatim and the
// placeholder assets are dropped once real artwork lands there.
if (site.icons) files['site.webmanifest'] = webManifest(site);

for (const [name, text] of Object.entries(files)) assertClean(name, text);

const ASSET_NAMES = ['favicon.svg', 'favicon.ico', 'favicon-96x96.png', 'apple-touch-icon.png', 'web-app-manifest-192x192.png', 'web-app-manifest-512x512.png'];
const eventsAssetDir = join(here, 'assets', site.id);

if (argv.includes('--check')) {
  console.log(`check ok: ${Object.keys(files).length} files; ${warnings} standing-code warnings; ${deals.length} unique deals; ${totalDeals} seasonal rows; leaderboard ${board.label} (${board.ranks.length})`);
} else {
  for (const [rel, text] of Object.entries(files)) {
    const p = join(outRoot, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  // Real icons if the user has dropped them in, placeholder stubs otherwise.
  let icons = 0;
  for (const name of ASSET_NAMES) {
    const src = join(eventsAssetDir, name);
    if (existsSync(src)) { copyFileSync(src, join(outRoot, name)); icons++; }
  }
  if (!icons && site.icons) writeFileSync(join(outRoot, 'favicon.svg'), PLACEHOLDER_FAVICON);
  console.log(`events (${site.origin}) -> ${outRoot}: ${Object.keys(files).length} files${site.icons ? `, ${icons || 'placeholder'} icon${icons === 1 ? '' : 's'}` : ''}`);
  console.log(`  hub: ${totalDeals} seasonal deals, ${events.length} categories, ${tags.length} tags, ${codes.length} standing codes`);
  console.log(`  leaderboard ${board.label}: ${board.ranks.length} firms, top ${board.ranks[0] ? `${board.ranks[0].firm} ${board.ranks[0].pct}%` : EN_DASH}`);
  console.log(`  unique deal rows in dataset.json: ${deals.length}; standing-code warnings: ${warnings}`);
}