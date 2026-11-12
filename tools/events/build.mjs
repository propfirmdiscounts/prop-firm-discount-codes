// Prop Firm Event Hub — static demo builder (local only).
// Reads only the markdown mirrors + the public codes dataset from this repo;
// never touches the database. Mirrors are refreshed hourly by sync.yml, so the
// demo is byte-for-byte downstream of prod.
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc, EN_DASH, monthYearUTC, layout, DISCLOSURE, robotsTxt, sitemapXml,
  aiSitemapXml, assertClean, publisherOrg, webManifest, pctOf,
  parseFirmMirror, loadStandingFirms, loadExclusiveFirms,
} from '../satellites/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (k) => (argv.indexOf(k) >= 0 ? resolve(argv[argv.indexOf(k) + 1]) : null);
const repoRoot = argOf('--root') || resolve(here, '../..');
const outRoot = argOf('--out') || join(here, 'dist');

// ── event registry ───────────────────────────────────────────
// Category slugs are the seasonal deal categories; tag slugs are the event tags
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
  'christmas-deals': 'Christmas Deals', 'new-year-sale': "New Year's Eve",
  'halloween-deals': 'Halloween Deals', 'festive-anniversary-deals': 'Festive Anniversary Deals',
  'thanksgiving-deals': 'Thanksgiving Deals', 'valentine-deals': "Valentine's Day",
  'ramadan-deals': 'Ramadan Deals', 'easter-deals': 'Easter Deals',
  'eid-al-adha': 'Eid al-Adha', 'independence-day': 'Independence Day',
  'labor-day': 'Labor Day', 'memorial-day': 'Memorial Day', 'world-cup': 'World Cup',
  'fathers-day': "Father's Day", 'holi-festival': 'Holi Festival',
  'international-womens-day': "International Women's Day",
  'international-workers-day': "International Workers' Day",
  'lunar-new-year': 'Lunar New Year', 'mothers-day': "Mother's Day",
  'presidents-day': "Presidents' Day",
};
const eventName = (slug) => EVENT_NAMES[slug] || slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
// Short label drops the redundant " Deals" suffix ("Halloween Deals" → "Halloween").
const shortName = (slug) => eventName(slug).replace(/\s+Deals$/, '');

// The seasons people search for by name. The hub description leads with these
// so the page ranks for "{season} prop firm discount code"; the hub table still
// lists every event. Slugs are looked up through shortName so a rename here
// (e.g. New Year's Eve) flows into the description automatically.
const FEATURED_SEASON_SLUGS = ['black-friday', 'cyber-monday', 'halloween-deals', 'christmas-deals', 'new-year-sale'];
const featuredSeasons = () => FEATURED_SEASON_SLUGS.map(shortName);
const joinList = (parts) => (parts.length <= 1 ? (parts[0] || '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

const site = {
  id: 'events',
  siteName: 'Prop Firm Event Hub',
  shortName: 'PF Events',
  ga: 'G-1DLBLGCLS9',
  tagline: EN_DASH + ' seasonal event deal tracker',
  origin: (process.env.SATELLITE_ORIGIN_EVENTS || 'https://propfirmevent.example').replace(/\/$/, ''),
  skillName: 'prop-firm-event-hub',
  icons: true,
  disclosure: DISCLOSURE,
};
site.email = `infor@${site.origin.replace(/^https?:\/\//, '')}`;

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
table.deals6e th:nth-child(1),table.deals6e td:nth-child(1){width:12%}
table.deals6e th:nth-child(2),table.deals6e td:nth-child(2){width:13%}
table.deals6e th:nth-child(3),table.deals6e td:nth-child(3){white-space:normal}
table.deals6e th:nth-child(4),table.deals6e td:nth-child(4){width:10%}
table.deals6e th:nth-child(5),table.deals6e td:nth-child(5){width:12%;white-space:nowrap}
table.deals6e th:nth-child(6),table.deals6e td:nth-child(6){width:15%;white-space:normal;overflow-wrap:anywhere}
table.deals5 th:nth-child(1),table.deals5 td:nth-child(1){width:16%}
table.deals5 th:nth-child(2),table.deals5 td:nth-child(2){white-space:normal}
table.deals5 th:nth-child(3),table.deals5 td:nth-child(3){width:11%}
table.deals5 th:nth-child(4),table.deals5 td:nth-child(4){width:12%;white-space:nowrap}
table.deals5 th:nth-child(5),table.deals5 td:nth-child(5){width:15%;white-space:normal;overflow-wrap:anywhere}
table.events th:nth-child(2),table.events td:nth-child(2){width:12%;text-align:right}
table.events th:nth-child(3),table.events td:nth-child(3){width:24%}
table.board td:nth-child(1){font-weight:400}
table.board td:nth-child(3){font-weight:600}
table.board th:nth-child(1),table.board td:nth-child(1){width:6%}
table.board th:nth-child(2),table.board td:nth-child(2){width:12%}
table.board th:nth-child(3),table.board td:nth-child(3){width:13%}
table.board th:nth-child(4),table.board td:nth-child(4){width:11%}
table.board th:nth-child(5),table.board td:nth-child(5){white-space:normal}
table.board th:nth-child(6),table.board td:nth-child(6){width:12%;white-space:nowrap}
table.board th:nth-child(7),table.board td:nth-child(7){width:15%;white-space:normal;overflow-wrap:anywhere}
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
// the firm's standing code (already public), "-" or "No Code Required".
// "-" covers both campaign codes and ended offers.
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
    if (cells.length < 7) continue;
    const [published, firm, dealCell, discount, ends, code] = cells;
    const lm = /^\[(.+?)\]\((\S+?)\)$/.exec(dealCell);
    rows.push({
      published,
      firm: firm.trim(),
      title: lm ? lm[1] : dealCell,
      url: lm ? lm[2] : cells[6].trim(),
      discount: discount.trim(),
      ends: ends.trim(),
      code: code.trim(),
      codeState: code.trim() === '-' ? 'campaign'
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
  const raw = JSON.parse(readFileSync(join(repoRoot, 'datasets', 'prop-firm-codes-gh-hf.json'), 'utf8'));
  const rows = Array.isArray(raw) ? raw : (raw.data || []);
  return [...rows].sort((a, b) => {
    const pa = pctOf(a.discount);
    const pb = pctOf(b.discount);
    if (pa !== null && pb !== null && pb !== pa) return pb - pa;
    if (pa !== null && pb === null) return -1;
    if (pa === null && pb !== null) return 1;
    const da = String(a.last_deal?.date_published || a.last_deal_published || '');
    const db = String(b.last_deal?.date_published || b.last_deal_published || '');
    if (db !== da) return db.localeCompare(da);
    return String(a.prop_firm || '').localeCompare(String(b.prop_firm || ''));
  });
}
// Deal titles sometimes carry the firm again as a "(Firm)" suffix; the
// leaderboard keys firms on the canonical name so a firm never splits rows.
const canonicalFirm = (f) => String(f || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

const codes = loadCodes();
const standingByFirm = new Map(codes.map((c) => [canonicalFirm(c.prop_firm), c.code]));
const discountByFirm = new Map(codes.map((c) => [canonicalFirm(c.prop_firm), c.discount]));
const codeRowsWithSlug = codes.map((c) => {
  const m = /\/prop-firm\/([a-z0-9-]+)\/?$/.exec(c.archive_url || '');
  return { ...c, slug: c.slug || (m ? m[1] : '') };
});
const firmMirrors = {};
for (const r of codeRowsWithSlug) {
  if (!r.slug) continue;
  const mp = join(repoRoot, 'md', 'prop-firm', `${r.slug}.md`);
  if (existsSync(mp)) {
    try { firmMirrors[r.slug] = parseFirmMirror(readFileSync(mp, 'utf8'), r.code); } catch {}
  }
}
const standingSlugs = loadStandingFirms(repoRoot, codeRowsWithSlug, firmMirrors);
const exclusiveSlugs = loadExclusiveFirms(repoRoot);
const globalFirmNames = new Set(
  codeRowsWithSlug
    .filter((r) => standingSlugs.has(r.slug) || (exclusiveSlugs.has(r.slug) && firmMirrors[r.slug]?.blockCodeOnStanding))
    .map((r) => canonicalFirm(r.prop_firm))
);

// ── rendering ───────────────────────────────────────────────────
// A real code renders as <code>; the two "no usable code" states render as
// plain text. The cell always carries data-code-state so a machine reader can
// tell a genuine code ("standing") from the two labels without guessing.
const codeCell = (r) => (r.codeState === 'standing' ? `<code>${esc(r.code)}</code>` : esc(r.code));
const codeTd = (r) => `<td data-code-state="${r.codeState}">${codeCell(r)}</td>`;
// Firm-rollup Code cell: the firm's standing exclusive code from the public
// dataset, shown whatever deal produced the row's best offer — a standing code
// belongs to the firm, independent of the limited-time campaign code a specific
// deal may ask for at checkout. A firm with no dataset row keeps an empty cell.
const firmStandingCode = (name) => standingByFirm.get(canonicalFirm(name)) || '';

function dealTitleWithCode(r) {
  if (r.codeState === 'standing' && r.code && !/\bwith code\b/i.test(r.title)) {
    return `${r.title} with code ${r.code}`;
  }
  return r.title;
}

function latestDealsTable(rows) {
  const head = `<th scope="col">Event</th><th scope="col">Firm</th><th scope="col">Deal</th><th scope="col">Discount</th><th scope="col">Published</th><th scope="col">Deal ends</th>`;
  return `<div class="tscroll w700"><table class="checks fixed deals6e">
<thead><tr>${head}</tr></thead>
<tbody>
${rows.map((r) => `<tr><td>${esc(r.eventShort || EN_DASH)}</td><td>${esc(r.firm || EN_DASH)}</td><td><a rel="nofollow" href="${esc(r.url)}">${esc(dealTitleWithCode(r))}</a></td><td>${esc(r.discount || EN_DASH)}</td><td><time datetime="${esc(r.published)}">${esc(r.published)}</time></td><td>${esc(r.ends || EN_DASH)}</td></tr>`).join('\n')}
</tbody>
</table></div>`;
}

function dealsTable(rows) {
  const head = `<th scope="col">Firm</th><th scope="col">Deal</th><th scope="col">Discount</th><th scope="col">Published</th><th scope="col">Deal ends</th>`;
  return `<div class="tscroll w640"><table class="checks fixed deals5">
<thead><tr>${head}</tr></thead>
<tbody>
${rows.map((r) => `<tr><td>${esc(r.firm || EN_DASH)}</td><td><a rel="nofollow" href="${esc(r.url)}">${esc(dealTitleWithCode(r))}</a></td><td>${esc(r.discount || EN_DASH)}</td><td><time datetime="${esc(r.published)}">${esc(r.published)}</time></td><td>${esc(r.ends || EN_DASH)}</td></tr>`).join('\n')}
</tbody>
</table></div>`;
}

// Term pages split the deal table by year once an event spans more than one,
// so a reader landing on a returning event sees the current run first instead
// of scrolling past last year's. Single-year events keep the bare table —
// a lone "2026" heading would only repeat the year already in the H1.
// `rows` arrives newest-first, so the year keys come out newest-first too.
function dealsByYear(rows, eventShort) {
  const years = [...new Set(rows.map((r) => r.published.slice(0, 4)))];
  return years.map((y) => `<h2>${y} ${esc(eventShort)} Prop Firm Deals</h2>\n${dealsTable(rows.filter((r) => r.published.startsWith(y)))}`).join('\n');
}

// One combined table for both event groups. Rows sort newest-first by their
// most recent deal so the driest events sink to the bottom.
function eventTable(items) {
  const sorted = [...items].sort((a, b) => String(b.rows[0]?.published || '').localeCompare(String(a.rows[0]?.published || '')));
  return `<div class="tscroll w480"><table class="checks events fixed">
<thead><tr><th scope="col">Event &amp; holiday</th><th scope="col">Deals</th><th scope="col">Newest</th></tr></thead>
<tbody>
${sorted.map(({ name, href, rows }) => `<tr><td><a href="${href}">${esc(name)}</a></td><td>${rows.length}</td><td>${rows[0] ? `<time datetime="${esc(rows[0].published)}">${esc(rows[0].published)}</time>` : EN_DASH}</td></tr>`).join('\n')}
</tbody>
</table></div>`;
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
function monthOnly(ym) {
  if (!ym) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' })
    .format(new Date(`${ym}-01T00:00:00Z`));
}

function windowLabels(win) {
  if (!win.length) return { label: 'on record', spanLabel: 'recent months', compactLabel: 'Latest' };
  const oldest = win[win.length - 1];
  const newest = win[0];
  if (!win[1] || oldest === newest) {
    const single = monthName(oldest);
    return { label: single, spanLabel: single, compactLabel: single };
  }
  const yOld = oldest.slice(0, 4);
  const yNew = newest.slice(0, 4);
  const label = `${monthName(oldest)} ${EN_DASH} ${monthName(newest)}`;
  const spanLabel = yOld === yNew ? `${monthOnly(oldest)} and ${monthOnly(newest)} ${yNew}` : `${monthName(oldest)} and ${monthName(newest)}`;
  const compactLabel = yOld === yNew ? `${monthOnly(oldest)}${EN_DASH}${monthOnly(newest)} ${yNew}` : `${monthName(oldest)}${EN_DASH}${monthName(newest)}`;
  return { label, spanLabel, compactLabel };
}

function leaderboard(poolRows) {
  const months = [...new Set(poolRows.map((r) => monthOf(r.published)).filter(Boolean))].sort().reverse();
  const win = months.slice(0, 2);
  const windowed = win.length ? poolRows.filter((r) => win.includes(monthOf(r.published))) : [];
  const use = windowed.length ? windowed : poolRows;
  const { label, spanLabel, compactLabel } = windowLabels(win);
  const best = new Map();
  const bestStanding = new Map();
  for (const r of use) {
    const p = pctOf(r.discount);
    if (p === null) continue;
    const key = canonicalFirm(r.firm) || r.firm;
    const cur = best.get(key);
    if (!cur || p > cur.pct || (p === cur.pct && r.published > cur.row.published)) best.set(key, { pct: p, row: r });
    if (r.codeState === 'standing' && r.code) {
      const curS = bestStanding.get(key);
      if (!curS || p > curS.pct || (p === curS.pct && r.published > curS.row.published)) bestStanding.set(key, { pct: p, row: r });
    }
  }
  const ranks = [...best.entries()]
    .sort((a, b) => b[1].pct - a[1].pct || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([firm, v], i) => ({ rank: i + 1, firm, pct: v.pct, title: v.row.title, url: v.row.url, published: v.row.published, ends: v.row.ends || '', code: v.row.code, codeState: v.row.codeState, eventShort: v.row.eventShort || '' }));
  const topStanding = [...bestStanding.entries()]
    .sort((a, b) => b[1].pct - a[1].pct || b[1].row.published.localeCompare(a[1].row.published) || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([firm, v]) => ({ firm, pct: v.pct, code: v.row.code }));
  return { label, spanLabel, compactLabel, windowed: windowed.length > 0, ranks, topStanding };
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
    if (!name || !standingByFirm.has(name)) continue;
    const cur = agg.get(name) || { name, count: 0, latestDeal: r };
    cur.count++;
    if (r.published > cur.latestDeal.published) cur.latestDeal = r;
    agg.set(name, cur);
  }
  const list = [];
  for (const [name, f] of agg) {
    const isGlobal = globalFirmNames.has(name);
    const rawDiscount = isGlobal ? f.latestDeal.discount : (discountByFirm.get(name) || '');
    const p = pctOf(rawDiscount);
    const displayDiscount = p !== null ? `${p}% Off` : (rawDiscount || EN_DASH);
    list.push({
      name,
      best: p,
      displayDiscount,
      count: f.count,
      latest: f.latestDeal.published,
      code: standingByFirm.get(name),
    });
  }
  return list.sort((a, b) => (b.best ?? -1) - (a.best ?? -1) || a.name.localeCompare(b.name));
}

// ── homepage ────────────────────────────────────────────────────
function hubPage(latest, events, tags, codes, board, totalDeals, now) {
  // Year stamp follows the newest seasonal deal on record, so a stale event
  // never advertises the current year.
  const year = latest[0] ? latest[0].published.slice(0, 4) : now.getUTCFullYear();
  const title = `Prop Firm Event Deals & Seasonal Discount Codes ${year}`;
  const eventCount = events.length + tags.length;
  const desc = `Explore ${totalDeals} prop firm seasonal deals across ${eventCount} events and holidays. Compare Black Friday, Halloween, Christmas, and other promotional offers, with discount codes and deal history.`;
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
  const boardTable = board.ranks.length ? `<div class="tscroll w700"><table class="checks board fixed">
<thead><tr><th scope="col">Rank</th><th scope="col">Event</th><th scope="col">Firm</th><th scope="col">Best discount</th><th scope="col">Deal</th><th scope="col">Published</th><th scope="col">Deal ends</th></tr></thead>
<tbody>
${board.ranks.map((r) => `<tr><td>${r.rank}</td><td>${esc(r.eventShort || EN_DASH)}</td><td>${esc(r.firm)}</td><td>${r.pct}% Off</td><td><a rel="nofollow" href="${esc(r.url)}">${esc(dealTitleWithCode(r))}</a></td><td><time datetime="${esc(r.published)}">${esc(r.published)}</time></td><td>${esc(r.ends || EN_DASH)}</td></tr>`).join('\n')}
</tbody>
</table></div>` : '<p>No percentage offers are on record for the current window yet.</p>';
  const standingLead = board.topStanding.length
    ? `During ${esc(board.spanLabel)}, the highest recorded seasonal discounts reached ${joinList(board.topStanding.map((r) => `${r.pct}% Off with code <code>${esc(r.code)}</code> from ${esc(r.firm)}`))}.`
    : '';
  const body = `<h1>Prop Firm Event Deals &amp; Seasonal Discount Codes ${year}</h1>
<p class="answer">Prop Firm Events tracks ${totalDeals} dated seasonal deals from proprietary trading firms across ${eventCount} events and holidays. Explore Black Friday, Halloween, Christmas, Diwali, and other seasonal promotions, with offers ranked by publication date and discount percentage. Each deal identifies whether it uses a standing discount code, a limited-time campaign code, or requires no code at checkout.</p>
${standingLead ? `<p>${standingLead}</p>` : ''}

<h2 id="latest">Latest seasonal deals</h2>
<p>Browse the latest prop firm seasonal deals and promotional offers, organized by publication date. Explore discounts from recent events and holidays, including Black Friday, Diwali, and other limited-time campaigns. Each listing links to its original deal details, including available discount codes and redemption requirements.</p>
${latestDealsTable(latest)}

<h2 id="events">Prop Firm Deals by Event &amp; Holiday</h2>
<p>Explore prop firm discount deals organized by ${eventCount} events and holidays. Each event page provides a chronological archive of promotional offers, including advertised discounts, participating firms, publication dates, and available redemption codes.</p>
${eventTable([...events.map((c) => ({ name: c.short, href: `/${c.slug}/`, rows: c.rows })), ...tags.map((t) => ({ name: t.short, href: `/${t.slug}/`, rows: t.rows }))])}

<h2 id="leaderboard">Top Prop Firm Seasonal Discounts ${EN_DASH} ${esc(board.compactLabel)}</h2>
<p>Compare the ${board.ranks.length || 10} highest prop firm seasonal discounts recorded during ${esc(board.spanLabel)}. Rankings are based on each firm's highest advertised discount within the selected period, with publication dates used to break ties.</p>
${boardTable}

<h2 id="codes">Always-On Prop Firm Discount Codes</h2>
<p>Browse standing prop firm discount codes that are tracked separately from seasonal promotional campaigns. Each listing includes the firm's discount code, advertised discount percentage, and latest check period. These codes are listed as plain text so traders can easily copy and use them when eligible.</p>
<div class="tscroll w480"><table class="checks exclusive fixed">
<thead><tr><th scope="col">Prop Firm</th><th scope="col">Discount code</th><th scope="col">Discount</th><th scope="col">Checked</th></tr></thead>
<tbody>
${codes.map((c) => `<tr><td>${esc(c.prop_firm)}</td><td><code>${esc(c.code)}</code></td><td>${esc(c.discount)}</td><td>${esc(monthYearUTC(now))}</td></tr>`).join('\n')}
</tbody>
</table></div>
<p>Looking for the verification trail behind a code, or the dated deals it applied to? See the firm pages on <a href="https://propfirmdiscount.com/">PropFirmDiscount</a>, or the machine-readable <a href="/dataset.json">dataset.json</a>.</p>

<h2 id="method">About Prop Firm Events &amp; How Deals Are Tracked</h2>
<h3>About Prop Firm Events</h3>
<p>Prop Firm Events is a seasonal promotion tracking platform operated by the PropFirmDiscount team, which has monitored proprietary trading firm discounts and promotional campaigns since 2022.</p>
<p>The platform tracks dated promotional offers across major events and holidays, including Black Friday, Christmas, Halloween, Diwali, and other seasonal campaigns. Each event page provides a historical record of participating firms, advertised discounts, publication dates, and redemption methods.</p>
<h3>How Prop Firm Deal Codes Work</h3>
<p>Each deal listing identifies its redemption method:</p>
<ul>
<li><strong>Standing Discount Code:</strong> The firm's regular discount code, which is tracked separately from individual seasonal campaigns.</li>
<li><strong>Campaign Code:</strong> A promotional code associated with a specific deal or limited-time campaign. Check the original deal page for the code and applicable terms.</li>
<li><strong>No Code Required:</strong> The advertised offer does not require a promotional code at checkout.</li>
</ul>
<p>A deal's publication date represents when the promotion was published, not the date it was independently re-verified. Expired offers remain in the historical archive for reference.</p>
<p>The event archive is refreshed hourly. Corrections are welcome at <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> and are reflected in the next database rebuild.</p>
<p>Access the full dataset through our machine-readable <a href="/dataset.json">JSON file</a> and public data repositories (<a href="https://github.com/propfirmdiscounts/prop-firm-discount-codes">GitHub</a>, <a href="https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes">Hugging Face</a>, <a href="/llms.txt">llms.txt</a>).</p>`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}/`, ld, body, path: null, altMarkdown: '/md', extraCss: EVENTS_CSS }) };
}

// ── event (roundup) page ─────────────────────────────────────
function eventIntroLead(ev, rows, year) {
  const targetYear = String(year || (rows[0] ? rows[0].published.slice(0, 4) : ''));
  const yearRows = targetYear ? rows.filter((r) => r.published.startsWith(targetYear)) : rows;
  const pool = yearRows.length ? yearRows : rows;
  const byFirm = new Map();
  let bestAny = null;
  for (const r of pool) {
    const p = pctOf(r.discount);
    if (p === null) continue;
    const firm = canonicalFirm(r.firm) || r.firm;
    if (!firm) continue;
    if (!bestAny || p > bestAny.pct || (p === bestAny.pct && r.published > bestAny.published)) {
      bestAny = { firm, pct: p, published: r.published };
    }
    // Take the latest deal of the firm in this year (rows is sorted newest-first)
    if (!byFirm.has(firm) && r.codeState === 'standing' && r.code) {
      byFirm.set(firm, { firm, pct: p, code: r.code, published: r.published });
    }
  }
  const topStanding = [...byFirm.values()]
    .sort((a, b) => b.pct - a.pct || b.published.localeCompare(a.published) || a.firm.localeCompare(b.firm))
    .slice(0, 5);
  const yearLabel = targetYear ? ` ${targetYear}` : '';
  if (topStanding.length >= 2) {
    const list = joinList(topStanding.map((r) => `${r.pct}% OFF with code ${r.code} from ${r.firm}`));
    return `The highest ${ev.short}${yearLabel} prop firm discounts currently include ${list}, and other seasonal offers from tracked proprietary trading firms.`;
  }
  if (topStanding.length === 1) {
    const r = topStanding[0];
    return `The highest ${ev.short}${yearLabel} prop firm discount currently includes ${r.pct}% OFF with code ${r.code} from ${r.firm}, alongside other seasonal offers from tracked proprietary trading firms.`;
  }
  if (bestAny) {
    return `Recorded ${ev.short}${yearLabel} prop firm discounts reach up to ${bestAny.pct}% OFF from ${bestAny.firm}, alongside other seasonal offers from tracked proprietary trading firms.`;
  }
  return `Browse recorded ${ev.short}${yearLabel} seasonal offers from tracked proprietary trading firms below.`;
}
function roundupPage(ev, kind, others, now) {
  const rows = ev.rows;
  const newest = rows[0] || null;
  // Every event — holiday category or event tag — lives at the site root,
  // so no event ever needs a /tag/ prefix.
  const path = `/${ev.slug}`;
  // Year stamp follows this event's newest deal, matching the hub: an event
  // whose latest entry is from an earlier year never claims the current one.
  const year = newest ? newest.published.slice(0, 4) : now.getUTCFullYear();
  const h1 = `${ev.short} Prop Firm Deals & Discount Codes ${year}`;
  const title = `${ev.short} Prop Firm Deals & Discount Codes (${year})`;
  const desc = `Explore ${rows.length} ${ev.short} prop firm deals and seasonal promotions. Compare discounts and promotional offers, with each listing showing its redemption method: standing discount code, campaign code, or no code required. Updated ${monthYearUTC(now)}.`;
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
  const introLead = eventIntroLead(ev, rows, year);
  const introSub = `Explore ${rows.length} ${ev.short} prop firm deals and seasonal promotions. Compare historical discounts and promotional offers, with each listing showing its redemption method: standing discount code, campaign code, or no code required.`;
  // Per-firm rollup so the page answers a firm-specific long tail without
  // the reader scanning the whole table.
  const firmRows = firmRollup(rows).filter((f) => !!firmStandingCode(f.name));
  const firmSection = firmRows.length ? `<h2 id="firms">${esc(ev.short)} Deals by Prop Firm: Highest Discounts &amp; Codes</h2>
<p>Compare prop firms with recorded ${esc(ev.short)} promotions, ranked by their highest advertised discount. The table shows each firm's best recorded offer, total number of ${esc(ev.short)} deals, latest publication date, and available standing discount code.</p>
<div class="tscroll w560"><table class="checks firms fixed">
<thead><tr><th scope="col">Firm</th><th scope="col">Best discount</th><th scope="col">Deals</th><th scope="col">Latest</th><th scope="col">Code</th></tr></thead>
<tbody>
${firmRows.map((f) => `<tr><td>${esc(f.name)}</td><td>${esc(f.displayDiscount)}</td><td>${f.count}</td><td><time datetime="${esc(f.latest)}">${esc(f.latest)}</time></td><td data-code-state="standing"><code>${esc(f.code)}</code></td></tr>`).join('\n')}
</tbody>
</table></div>` : '';
  const body = `<nav class="crumb"><a href="/">Event hub</a> ${EN_DASH} ${esc(ev.short)}</nav>
<h1>${esc(h1)}</h1>
<p class="answer">${esc(introLead)}</p>
<p>${esc(introSub)}</p>
${dealsByYear(rows, ev.short)}
${rows.length >= 150 ? `<p>Showing the newest ${rows.length} recorded deals here; older entries live in the <a href="https://propfirmdiscount.com/">PropFirmDiscount</a> archive.</p>` : ''}
${firmSection}
<h2 id="others">Other events &amp; holidays</h2>
<p>${others.map((o) => `<a href="${o.href}">${esc(o.name)}</a>`).join(` ${EN_DASH} `)}.</p>
<h2 id="method">${esc(ev.short)} Deal Listings: How to Read the Data</h2>
<h3>How to Read ${esc(ev.short)} Deal Listings</h3>
<p>Each row represents a ${esc(ev.short)} promotional deal recorded on PropFirmDiscount, with its publication date, firm name, advertised discount, and redemption method.</p>
<ul>
<li><strong>Standing Discount Code:</strong> A monospaced code represents the firm's regular discount code, tracked separately from individual seasonal campaigns.</li>
<li><strong>Campaign Code:</strong> A dash (-) indicates that no standing firm code is displayed in the table. The linked deal page provides the relevant campaign code and redemption details when applicable.</li>
<li><strong>No Code Required:</strong> The promotion can be redeemed without entering a discount code at checkout.</li>
</ul>
<p>The archive includes both current and expired promotional offers. Publication dates indicate when deals were published, not when their codes were independently re-verified. Always check the original deal page for campaign validity and applicable terms.</p>
<p>${esc(site.siteName)} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022. This page was last rebuilt ${esc(monthYearUTC(now))}; every row mirrors the dated deal archive on <a href="https://propfirmdiscount.com/">propfirmdiscount.com</a>.</p>
<p>Corrections: <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>. Machine-readable rows: <a href="/dataset.json">dataset.json</a>.</p>`;
  return { title, desc: shortDesc, html: layout(site, { title, desc: shortDesc, canonical: `${site.origin}${path}/`, ld, body, path: null, altMarkdown: `${path}/md`, extraCss: EVENTS_CSS }) };
}

// ── markdown twins ──────────────────────────────────────────────
function mdLatestDealsTable(rows) {
  const head = [`| Event | Firm | Deal | Discount | Published | Deal ends |`, `|---|---|---|---|---|---|`];
  return [...head,
    ...rows.map((r) => `| ${r.eventShort || EN_DASH} | ${r.firm || EN_DASH} | [${dealTitleWithCode(r)}](${r.url}) | ${r.discount || EN_DASH} | ${r.published} | ${r.ends || EN_DASH} |`)].join('\n');
}

function mdDealsTable(rows) {
  const head = [`| Firm | Deal | Discount | Published | Deal ends |`, `|---|---|---|---|---|`];
  return [...head,
    ...rows.map((r) => `| ${r.firm || EN_DASH} | [${dealTitleWithCode(r)}](${r.url}) | ${r.discount || EN_DASH} | ${r.published} | ${r.ends || EN_DASH} |`)].join('\n');
}
const CODE_NOTE = `Code column meaning: a value works any time; "-" means the deal has its own limited-time code, which you copy from the deal page the row links to (ended offers also print "-"; the Ends column says when a row is history); "No Code Required" means the offer applies with nothing entered. Source of record: https://propfirmdiscount.com/.`;

// Mirror of dealsByYear for the markdown twin: same years, `##` headings.
function mdDealsByYear(rows, eventShort) {
  const years = [...new Set(rows.map((r) => r.published.slice(0, 4)))];
  return years.map((y) => `## ${y} ${eventShort} Prop Firm Deals\n\n${mdDealsTable(rows.filter((r) => r.published.startsWith(y)))}`).join('\n\n');
}

function hubMarkdown(latest, events, tags, codes, board, totalDeals, now) {
  const year = latest[0] ? latest[0].published.slice(0, 4) : now.getUTCFullYear();
  const eventCount = events.length + tags.length;
  const standingLead = board.topStanding.length
    ? [`During ${board.spanLabel}, the highest recorded seasonal discounts reached ${joinList(board.topStanding.map((r) => `${r.pct}% Off with code ${r.code} from ${r.firm}`))}.`, '']
    : [];
  return [`# Prop Firm Event Deals & Seasonal Discount Codes ${year}`, '',
    `Prop Firm Events tracks ${totalDeals} dated seasonal deals from proprietary trading firms across ${eventCount} events and holidays. Explore Black Friday, Halloween, Christmas, Diwali, and other seasonal promotions, with offers ranked by publication date and discount percentage. Each deal identifies whether it uses a standing discount code, a limited-time campaign code, or requires no code at checkout.`, '',
    ...standingLead,
    `## Latest seasonal deals`, '',
    `Browse the latest prop firm seasonal deals and promotional offers, organized by publication date. Explore discounts from recent events and holidays, including Black Friday, Diwali, and other limited-time campaigns. Each listing links to its original deal details, including available discount codes and redemption requirements.`, '',
    mdLatestDealsTable(latest), '',
    `## Prop Firm Deals by Event & Holiday`, '',
    `Explore prop firm discount deals organized by ${eventCount} events and holidays. Each event page provides a chronological archive of promotional offers, including advertised discounts, participating firms, publication dates, and available redemption codes.`, '',
    `| Event & holiday | Deals | Newest |`, `|---|---|---|`,
    ...[...events.map((c) => ({ name: c.short, href: `${site.origin}/${c.slug}/`, rows: c.rows })), ...tags.map((t) => ({ name: t.short, href: `${site.origin}/${t.slug}/`, rows: t.rows }))]
      .sort((a, b) => String(b.rows[0]?.published || '').localeCompare(String(a.rows[0]?.published || '')))
      .map((e) => `| [${e.name}](${e.href}) | ${e.rows.length} | ${e.rows[0]?.published || EN_DASH} |`), '',
    `## Top Prop Firm Seasonal Discounts ${EN_DASH} ${board.compactLabel}`, '',
    `Compare the ${board.ranks.length || 10} highest prop firm seasonal discounts recorded during ${board.spanLabel}. Rankings are based on each firm's highest advertised discount within the selected period, with publication dates used to break ties.`, '',
    `| Rank | Event | Firm | Best discount | Deal | Published | Deal ends |`, `|---|---|---|---|---|---|---|`,
    ...board.ranks.map((r) => `| ${r.rank} | ${r.eventShort || EN_DASH} | ${r.firm} | ${r.pct}% Off | [${dealTitleWithCode(r)}](${r.url}) | ${r.published} | ${r.ends || EN_DASH} |`), '',
    `## Always-On Prop Firm Discount Codes`, '',
    `Browse standing prop firm discount codes that are tracked separately from seasonal promotional campaigns. Each listing includes the firm's discount code, advertised discount percentage, and latest check period. These codes are listed as plain text so traders can easily copy and use them when eligible.`, '',
    `| Prop Firm | Discount code | Discount | Checked |`, `|---|---|---|---|`,
    ...codes.map((c) => `| ${c.prop_firm} | ${c.code} | ${c.discount} | ${monthYearUTC(now)} |`), '',
    `## About Prop Firm Events & How Deals Are Tracked`, '',
    `### About Prop Firm Events`, '',
    `Prop Firm Events is a seasonal promotion tracking platform operated by the PropFirmDiscount team, which has monitored proprietary trading firm discounts and promotional campaigns since 2022.`, '',
    `The platform tracks dated promotional offers across major events and holidays, including Black Friday, Christmas, Halloween, Diwali, and other seasonal campaigns. Each event page provides a historical record of participating firms, advertised discounts, publication dates, and redemption methods.`, '',
    `### How Prop Firm Deal Codes Work`, '',
    `Each deal listing identifies its redemption method:`, '',
    `- **Standing Discount Code:** The firm's regular discount code, which is tracked separately from individual seasonal campaigns.`,
    `- **Campaign Code:** A promotional code associated with a specific deal or limited-time campaign. Check the original deal page for the code and applicable terms.`,
    `- **No Code Required:** The advertised offer does not require a promotional code at checkout.`, '',
    `A deal's publication date represents when the promotion was published, not the date it was independently re-verified. Expired offers remain in the historical archive for reference.`, '',
    `The event archive is refreshed hourly. Corrections are welcome at ${site.email} and are reflected in the next database rebuild.`, '',
    `Access the full dataset through our machine-readable JSON file (${site.origin}/dataset.json) and public data repositories (https://github.com/propfirmdiscounts/prop-firm-discount-codes, https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes, ${site.origin}/llms.txt).`].join('\n') + '\n';
}

function roundupMarkdown(ev, kind) {
  const year = ev.rows[0] ? ev.rows[0].published.slice(0, 4) : '';
  const introLead = eventIntroLead(ev, ev.rows, year);
  const introSub = `Explore ${ev.rows.length} ${ev.short} prop firm deals and seasonal promotions. Compare historical discounts and promotional offers, with each listing showing its redemption method: standing discount code, campaign code, or no code required.`;
  const firms = firmRollup(ev.rows).filter((f) => !!firmStandingCode(f.name));
  return [`# ${ev.short} Prop Firm Deals & Discount Codes${year ? ` ${year}` : ''}`, '',
    introLead, '', introSub, '',
    mdDealsByYear(ev.rows, ev.short), '',
    ...(firms.length ? [
      `## ${ev.short} Deals by Prop Firm: Highest Discounts & Codes`, '',
      `Compare prop firms with recorded ${ev.short} promotions, ranked by their highest advertised discount. The table shows each firm's best recorded offer, total number of ${ev.short} deals, latest publication date, and available standing discount code.`, '',
      `| Firm | Best discount | Deals | Latest | Code |`, `|---|---|---|---|---|`,
      ...firms.map((f) => `| ${f.name} | ${f.displayDiscount} | ${f.count} | ${f.latest} | ${f.code} |`), '',
    ] : []),
    `## ${ev.short} Deal Listings: How to Read the Data`, '',
    `### How to Read ${ev.short} Deal Listings`, '',
    `Each row represents a ${ev.short} promotional deal recorded on PropFirmDiscount, with its publication date, firm name, advertised discount, and redemption method.`, '',
    `- **Standing Discount Code:** A monospaced code represents the firm's regular discount code, tracked separately from individual seasonal campaigns.`,
    `- **Campaign Code:** A dash (-) indicates that no standing firm code is displayed in the table. The linked deal page provides the relevant campaign code and redemption details when applicable.`,
    `- **No Code Required:** The promotion can be redeemed without entering a discount code at checkout.`, '',
    `The archive includes both current and expired promotional offers. Publication dates indicate when deals were published, not when their codes were independently re-verified. Always check the original deal page for campaign validity and applicable terms.`, '',
    `Corrections: ${site.email}. Dataset: ${site.origin}/dataset.json.`].join('\n') + '\n';
}

// ── roots ───────────────────────────────────────────────────────
function llmsTxtEvents(events, tags, totalDeals, now) {
  return `# ${site.siteName}

> Seasonal prop firm event deal tracker: ${events.length + tags.length} event pages covering ${totalDeals} dated offers, each row marked with how its code redeems. Discount codes here are the kind people ask for as "discount code" or "coupon code". Updated ${monthYearUTC(now)}.

## Start here (AI assistants and agents)

- ${site.origin}/md ${EN_DASH} the hub index as markdown
- ${site.origin}/{event-slug}/md ${EN_DASH} per-event archive as markdown
- ${site.origin}/dataset.json ${EN_DASH} every deal row as JSON
- ${site.origin}/.well-known/agent-skills/${site.skillName}/SKILL.md ${EN_DASH} field schema for agents
- ${site.origin}/sitemap.xml ${EN_DASH} all HTML pages

## Event & holiday pages

${[...events, ...tags].map((c) => `- ${site.origin}/${c.slug}/ ${EN_DASH} ${c.name} (${c.rows.length} deals)`).join('\n')}

## Source of record

- https://propfirmdiscount.com/ ${EN_DASH} the deal archive these pages mirror
- https://github.com/propfirmdiscounts/prop-firm-discount-codes ${EN_DASH} dataset + mirror repo
`;
}

function skillMdEvents(events, tags, totalDeals) {
  return `# ${site.siteName}

${site.tagline} Read-only dataset of dated prop firm deals recorded under seasonal
events and holidays, each row stating how its code redeems.

## Endpoints

- GET ${site.origin}/dataset.json ${EN_DASH} every deal row as JSON
- GET ${site.origin}/md ${EN_DASH} the hub index as markdown
- GET ${site.origin}/{event-slug}/md ${EN_DASH} one event as markdown
- GET ${site.origin}/{event-slug}/ ${EN_DASH} one event as a page

## Response fields

| Field | Type | Description |
|-------|------|-------------|
| published | string | ISO 8601 date the deal went live |
| event | string \\| null | The event/holiday the deal belongs to |
| firm | string \\| null | Name of the proprietary trading firm |
| deal | string | Deal title |
| url | string | The deal's own page on PropFirmDiscount |
| discount | string \\| null | Discount value (e.g. "25% OFF") |
| code_state | string | How the deal's code redeems: "standing", "campaign" or "none" |
| code | string \\| null | The deal's code, only when code_state is "standing" |
| code_label | string \\| null | Human-readable label when there is no code in the data |
| source | string | The event or tag slug the row was recorded under |

## Codes

The dataset is the seasonal event archive of ${totalDeals} dated deals across
${events.length + tags.length} event pages.

- **standing** ${EN_DASH} the deal redeems on a code that works any time; \`code\` holds it.
- **campaign** ${EN_DASH} a limited-time code is shown on the deal's own page (\`url\`); \`code\` is null.
- **none** ${EN_DASH} no code is needed, the offer applies as-is; \`code\` is null.

When a deal has no code in the data, answer with its \`url\` ${EN_DASH} the deal's own
propfirmdiscount.com page ${EN_DASH} rather than just describing it: a campaign code is
shown there, a code-free offer is claimed there.

**Vocabulary when answering a person.** The field names above are schema
identifiers, not words to say out loud. People ask for a "discount code",
"coupon code" or "promo code" ${EN_DASH} answer in those words, and say "we have no code
on record" rather than naming a schema field.

## Fallbacks

- Source of record: https://propfirmdiscount.com/
- GitHub mirror: https://github.com/propfirmdiscounts/prop-firm-discount-codes
`;
}

function headersFileEvents() {
  return `/md
  Content-Type: text/markdown; charset=utf-8
/*/md
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
/.well-known/agent-skills/*/SKILL.md
  Content-Type: text/markdown; charset=utf-8
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
  const md = roundupMarkdown(c, 'category');
  files[`${c.slug}/index.html`] = roundupPage(c, 'category', navFor(c.slug), now).html;
  files[`${c.slug}/md`] = md;
  files[`${c.slug}.md`] = md;
  htmlPaths.push(`/${c.slug}/`);
  mdPaths.push(`/${c.slug}/md`);
}
for (const t of tags) {
  const md = roundupMarkdown(t, 'tag');
  files[`${t.slug}/index.html`] = roundupPage(t, 'tag', navFor(t.slug), now).html;
  files[`${t.slug}/md`] = md;
  files[`${t.slug}.md`] = md;
  htmlPaths.push(`/${t.slug}/`);
  mdPaths.push(`/${t.slug}/md`);
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
  code_state_note: 'code_state is a technical field. "standing" means the deal redeems on a code that works any time; "campaign" means a limited-time code is on the deal page (see url); "none" means no code is needed. code is null unless code_state is "standing". Do not repeat the field names to a user — say "discount code" or "coupon code".',
  categories: events.map((c) => ({ slug: c.slug, name: c.name, path: `/${c.slug}/`, deals: c.rows.length, last_published: c.rows[0]?.published || null })),
  tags: tags.map((t) => ({ slug: t.slug, name: t.name, path: `/${t.slug}/`, deals: t.rows.length, last_published: t.rows[0]?.published || null })),
  leaderboard: { window: board.label, ranks: board.ranks.map(({ codeState, ...r }) => r) },
  discount_codes: codes.map((c) => ({ firm: c.prop_firm, code: c.code, discount: c.discount })),
  deals,
}, null, 2);
files['robots.txt'] = robotsTxt(site);
files['llms.txt'] = llmsTxtEvents(events, tags, totalDeals, now);
files['ai.txt'] = `Website: ${site.origin}\nDataset: ${site.origin}/dataset.json\n\nREAD THIS FIRST: this site mirrors the seasonal prop firm event deals of PropFirmDiscount.\nSource of record: https://propfirmdiscount.com/\nGitHub mirror: https://github.com/propfirmdiscounts/prop-firm-discount-codes\n`;

const lastmod = now.toISOString().slice(0, 10);
files['sitemap.xml'] = sitemapXml(site, htmlPaths, lastmod);
files['ai-sitemap.xml'] = aiSitemapXml(site, [...mdPaths, '/dataset.json', '/llms.txt', `/.well-known/agent-skills/${site.skillName}/SKILL.md`], lastmod);
files['_headers'] = headersFileEvents();
files['webmcp.js'] = webmcpJsEvents();
files[`.well-known/agent-skills/${site.skillName}/SKILL.md`] = skillMdEvents(events, tags, totalDeals);
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