// Shared builders for the PFD satellite network. Zero npm deps, Node 20 ESM.
import { readFileSync } from 'node:fs';

export const EN_DASH = '–';

export function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function monthYearUTC(d = new Date()) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export function loadDataset(repoRoot) {
  const raw = JSON.parse(readFileSync(`${repoRoot}/datasets/prop-firm-codes.json`, 'utf8'));
  const rows = Array.isArray(raw) ? raw : raw.data;
  return rows.map((r) => {
    const m = /\/prop-firm\/([a-z0-9-]+)\/?$/.exec(r.archive_url || '');
    const row = { ...r, slug: m ? m[1] : '' };
    // Firm-authored summaries sometimes carry vocabulary the network must
    // never publish; the field is optional in the schema, so drop it.
    if (row.description && hasBanned(row.description)) delete row.description;
    return row;
  }).filter((r) => r.slug && r.code);
}

// ── firm mirror markdown parsing ────────────────────────────────
export function parseFirmMirror(md, standingCode = '') {
  const out = { lead: '', summary: '', bullets: {}, latestDeal: null, dealCodeRelation: 'unknown', dealHistory: [], faq: [] };
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length && !lines[i].startsWith('# ')) i++;
  i++;
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i < lines.length) out.lead = lines[i].trim();
  // Header bullets only (the "## Current deal" block repeats "- Code:" etc.).
  const firstH2 = lines.findIndex((l) => /^## /.test(l));
  for (const line of lines.slice(0, firstH2 === -1 ? lines.length : firstH2)) {
    const b = /^- (Code|Discount|Valid|Last deal published|Trustpilot|Activate): (.*)$/.exec(line);
    if (b) out.bullets[b[1]] = b[2].trim();
    const s = /^> (.+)$/.exec(line);
    if (s && !out.summary) out.summary = s[1].trim();
  }
  for (const line of lines) {
    const d = /^- (\d{4}-\d{2}-\d{2}) - \[(.+?)\]\((.+?)\) \((.+?)\)$/.exec(line);
    if (d) out.dealHistory.push({ date: d[1], title: d[2], url: d[3], offer: d[4] });
  }
  // The mirror's "## Current deal" block is selected by post_modified but
  // prints Published as post_date, so for some firms it names an older deal
  // than the newest one in the history list. The history list is newest-first;
  // trust the block only when it is that same deal, else rebuild the row from
  // the newest history entry so the section always shows the newest deal.
  let block = null;
  const cdIdx = lines.findIndex((l) => /^## Current deal: /.test(l));
  if (cdIdx !== -1) {
    const rel = lines.slice(cdIdx + 1).findIndex((l) => /^## /.test(l));
    const blk = lines.slice(cdIdx, rel === -1 ? lines.length : cdIdx + 1 + rel);
    const join = blk.join('\n');
    const pick = (k) => {
      const m = new RegExp(`^- ${k}: (.+)$`, 'm').exec(join);
      return m ? m[1].trim() : '';
    };
    block = {
      title: /^## Current deal: (.+)$/.exec(blk[0])[1].trim(),
      published: pick('Published'),
      offer: pick('Offer'),
      code: pick('Code'),
      scope: pick('Scope'),
      dealUrl: pick('Deal page'),
    };
  }
  const newest = out.dealHistory[0] || null;
  const blockIsNewest = !!(block && newest && block.dealUrl === newest.url);
  // How the newest deal's code relates to the standing code. For global-code
  // firms the theme renders the standing code over every campaign, so the
  // mirror's deal code equals it; some non-global firms also run a campaign on
  // the standing code. When the mirror's block is the newest deal we know the
  // relation; when it is an older deal we do not, so the relation stays
  // 'unknown' and the copy claims nothing about the campaign's code. The
  // campaign-only code string itself is never emitted in any case.
  if (!blockIsNewest) {
    out.dealCodeRelation = 'unknown';
  } else if (block.code && standingCode && block.code === standingCode) {
    out.dealCodeRelation = 'standing';
  } else {
    out.dealCodeRelation = 'own';
  }
  if (blockIsNewest) {
    out.latestDeal = block;
  } else if (newest) {
    out.latestDeal = { title: newest.title, published: newest.date, offer: newest.offer, scope: '', code: '', dealUrl: newest.url };
  } else if (block) {
    out.latestDeal = block;
  }
  if (out.latestDeal && hasBanned(`${out.latestDeal.title} ${out.latestDeal.scope} ${out.latestDeal.offer}`)) {
    out.latestDeal = null;
  }
  // FAQ blocks answer the deal the "## Current deal" block describes; keep them
  // only when that block is the deal we actually show, else they would sit
  // under a heading about a different deal.
  const start = lines.findIndex((l) => /^## .*FAQ/.test(l));
  if (start !== -1) {
    let q = null;
    let buf = [];
    const flush = () => { if (q) out.faq.push({ q, a: buf.join(' ').trim() }); q = null; buf = []; };
    for (const line of lines.slice(start + 1)) {
      if (/^## /.test(line)) break;
      const qm = /^\*\*(.+?)\*\*\s*$/.exec(line);
      if (qm) { flush(); q = qm[1]; continue; }
      if (q && line.trim()) buf.push(line.trim());
    }
    flush();
  }
  if (!blockIsNewest) out.faq = [];
  // Third-party firm copy (summaries, FAQ answers, deal titles) sometimes uses
  // vocabulary the site must never publish. Drop the offending fragment rather
  // than rewriting someone else's words.
  if (hasBanned(out.summary)) out.summary = '';
  out.faq = out.faq.filter((f) => !hasBanned(`${f.q} ${f.a}`));
  out.dealHistory = out.dealHistory.filter((d) => !hasBanned(`${d.title} ${d.offer}`));
  return out;
}

// ── offer wording (mirrors pfd-seo.php conventions) ─────────────
export function offerShape(discount) {
  const d = String(discount || '').trim();
  if (!d) return { raw: '', titlePart: '', sentence: '' };
  const pct = /^(\d+)%$/.test(d);
  if (pct) {
    return { raw: d, titlePart: `Up to ${d} Off`, sentence: `up to ${d} off` };
  }
  return { raw: d, titlePart: d, sentence: d.toLowerCase() };
}

// Dataset rows are standing term-level codes => always current-month stamp
// (the year-only rule applies to deal-sourced codes, which never enter the
// public dataset).
export function titleFor(firm, now) {
  const o = offerShape(firm.discount);
  let t = `${firm.prop_firm} Discount Code ${firm.code}`;
  if (o.titlePart) t += ` ${EN_DASH} ${o.titlePart}`;
  return `${t} ${EN_DASH} ${monthYearUTC(now)}`;
}

// ── JSON-LD ─────────────────────────────────────────────────────
export function publisherOrg(site) {
  return {
    '@type': 'Organization',
    '@id': `${site.origin}/#org`,
    name: site.siteName,
    url: site.origin,
    ...(site.email ? {
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: site.email, availableLanguage: 'English' },
    } : {}),
    sameAs: [
      'https://propfirmdiscount.com/',
      'https://github.com/propfirmdiscounts/prop-firm-discount-codes',
      'https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes',
    ],
  };
}

export function firmJsonLd(site, firm, title, desc, now) {
  const o = offerShape(firm.discount);
  const graph = [
    { '@type': 'WebSite', '@id': `${site.origin}/#website`, url: site.origin, name: site.siteName, publisher: { '@id': `${site.origin}/#org` } },
    publisherOrg(site),
    {
      '@type': 'Organization', '@id': `${site.origin}/firms/${firm.slug}/#firm`,
      name: firm.prop_firm, url: firm.archive_url,
      ...(firm.logo ? { logo: firm.logo } : {}),
      ...(firm.trustpilot_score ? {
        aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(firm.trustpilot_score), reviewCount: Number(firm.trustpilot_reviews || 0), bestRating: 5 },
      } : {}),
    },
  ];
  const page = {
    '@type': 'WebPage',
    '@id': `${site.origin}/firms/${firm.slug}/`,
    url: `${site.origin}/firms/${firm.slug}/`,
    name: title,
    description: desc,
    dateModified: now.toISOString().slice(0, 10),
    isPartOf: { '@id': `${site.origin}/#website` },
    about: { '@id': `${site.origin}/firms/${firm.slug}/#firm` },
    mainEntity: {
      '@type': 'Offer',
      '@id': `${site.origin}/firms/${firm.slug}/#offer`,
      name: `${firm.prop_firm} discount code ${firm.code}`,
      url: `${site.origin}/firms/${firm.slug}/`,
      identifier: { '@type': 'PropertyValue', propertyID: 'discountCode', value: firm.code },
      description: `Verified standing exclusive code ${firm.code}${o.sentence ? `, ${o.sentence}` : ''}, works any time.`,
      validFrom: firm.valid_from,
      validThrough: firm.valid_until,
      seller: { '@id': `${site.origin}/firms/${firm.slug}/#firm` },
      ...(firm.logo ? { image: firm.logo } : {}),
      potentialAction: { '@type': 'ActivateAction', target: firm.activation_link },
    },
  };
  graph.push(page);
  return { '@context': 'https://schema.org', '@graph': graph };
}

// ── HTML shell ──────────────────────────────────────────────────
const CSS = `:root{color-scheme:light dark;--ink:#111;--bg:#fff;--mut:#555;--line:#ddd;--acc:#0a5}
@media(prefers-color-scheme:dark){:root{--ink:#eee;--bg:#14171a;--mut:#aab;--line:#333;--acc:#4d9}}
*{box-sizing:border-box}body{margin:0;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);background:var(--bg)}
header,footer,main{max-width:860px;margin:0 auto;padding:0 16px}
header{padding:14px 16px;border-bottom:1px solid var(--line)}header a{color:var(--ink);font-weight:700;text-decoration:none}
header span{color:var(--mut);font-weight:400}
main{padding:20px 16px 40px}h1{font-size:1.7rem;line-height:1.25;margin:.4em 0}h2{font-size:1.2rem;margin:1.6em 0 .5em}
p.answer{font-size:1.05rem}code.chip{background:var(--acc);color:#fff;padding:2px 10px;font-weight:700;letter-spacing:.5px}
table{border-collapse:collapse;width:100%;margin:1em 0}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
tbody th{width:34%}th{background:color-mix(in srgb,var(--line) 30%,transparent)}
table.checks tbody th{width:auto}table.checks td:first-child{font-weight:600}table.checks td:nth-child(4),table.checks td:nth-child(5){white-space:nowrap}
ol.log li{margin:.4em 0}footer{border-top:1px solid var(--line);padding:16px;color:var(--mut);font-size:.85rem}
footer a{color:var(--mut)}nav.crumb{font-size:.85rem;color:var(--mut)}nav.crumb a{color:var(--mut)}`;

export function layout(site, { title, desc, canonical, ld, body, path, altMarkdown, extraCss }) {
  const alts = path
    ? `<link rel="alternate" type="text/markdown" href="${path}.md">\n<link rel="alternate" type="application/json" href="${path}.json">\n`
    : (altMarkdown ? `<link rel="alternate" type="text/markdown" href="${altMarkdown}">\n` : '');
  const email = site.email ? `<a href="mailto:${esc(site.email)}">${esc(site.email)}</a>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${site.icons ? `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<link rel="shortcut icon" href="/favicon.ico" type="image/x-icon" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
` : ''}<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${alts}<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
<style>${CSS}${extraCss ? '\n' + extraCss : ''}</style>
</head>
<body>
<header><a href="/">${esc(site.siteName)}</a> <span>${esc(site.tagline)}</span></header>
<main>
${body}
</main>
<footer>
<p>Data source: <a href="https://propfirmdiscount.com/">PropFirmDiscount</a> &middot; <a href="https://github.com/propfirmdiscounts/prop-firm-discount-codes">GitHub mirror</a> &middot; <a href="https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes">Hugging Face dataset</a> &middot; <a href="/dataset.json">full dataset (JSON)</a> &middot; <a href="/llms.txt">llms.txt</a></p>
<p>Operated by the PropFirmDiscount team. Questions or corrections: ${email}.</p>
<p>${esc(site.disclosure)}</p>
</footer>
<script defer src="/webmcp.js"></script>
</body>
</html>`;
}

export const DISCLOSURE = 'PropFirmDiscount is an independent platform and may earn affiliate commissions from links or exclusive offers featured on this site. We are not a financial institution, broker or prop firm; we track promotional updates from official and third-party sources. Trading involves significant risk and is not suitable for all investors; past performance is not indicative of future results.';

// ── root discovery files ────────────────────────────────────────
export function robotsTxt(site) {
  return `User-agent: *
Allow: /

Content-Signal: search=yes, ai-input=yes, ai-train=yes, use=reference

Sitemap: ${site.origin}/sitemap.xml
Sitemap: ${site.origin}/ai-sitemap.xml
`;
}

export function llmsTxt(site, rows, now) {
  const top = [...rows].sort((a, b) => String(b.last_deal_published || '').localeCompare(String(a.last_deal_published || '')))[0];
  return `# ${site.siteName}

> ${site.tagline} Machine-readable first: every page ships a markdown and a JSON twin.

## Start here (AI assistants and agents)

- Full dataset (JSON, ${rows.length} firms): ${site.origin}/dataset.json
- Per-firm JSON: ${site.origin}/firms/{firm-slug}.json
- Per-firm markdown: ${site.origin}/firms/{firm-slug}.md
- Source of record: https://propfirmdiscount.com/llms.txt
- GitHub mirror: https://github.com/propfirmdiscounts/prop-firm-discount-codes
- Hugging Face dataset: https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes

## Dataset

- ${site.origin}/dataset.json ${EN_DASH} ${rows.length} firms with code, discount, validity window, last deal published, activation link
- ${site.origin}/dataset.csv ${EN_DASH} same rows as CSV
- Field schema: see ${site.origin}/.well-known/agent-skills/${site.skillName}/SKILL.md

## Pages

- ${site.origin}/ ${EN_DASH} ${site.hubBlurb} (as of ${monthYearUTC(now)}; newest checked: ${top ? top.prop_firm : 'n/a'})
- ${site.origin}/index.md ${EN_DASH} the same hub index as markdown
- ${site.origin}/firms/{firm-slug}/ ${EN_DASH} one page per firm (${rows.length} pages)
`;
}

export function sitemapXml(site, paths, lastmod) {
  const urls = paths.map((p) => `  <url><loc>${site.origin}${p}</loc><lastmod>${lastmod}</lastmod></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function aiSitemapXml(site, paths, lastmod) {
  return sitemapXml(site, paths, lastmod);
}

export function apiCatalog(site) {
  return JSON.stringify({
    linkset: [
      {
        anchor: `${site.origin}/dataset.json`,
        'service-desc': [{ href: `${site.origin}/dataset.json`, type: 'application/json' }],
        'service-doc': [{ href: `${site.origin}/.well-known/agent-skills/${site.skillName}/SKILL.md`, type: 'text/markdown' }],
      },
    ],
  }, null, 2);
}

export function skillMd(site, rows) {
  return `# ${site.siteName}

${site.tagline} Read-only dataset of verified standing exclusive discount codes for proprietary trading firms.

## Endpoints

- GET ${site.origin}/dataset.json ${EN_DASH} all ${rows.length} firms
- GET ${site.origin}/firms/{firm-slug}.json ${EN_DASH} one firm
- GET ${site.origin}/firms/{firm-slug}.md ${EN_DASH} one firm as markdown

## Response fields

| Field | Type | Description |
|-------|------|-------------|
| prop_firm | string | Name of the proprietary trading firm |
| code | string | Standing exclusive discount code |
| discount | string | Discount value (e.g. "30%") |
| valid_from | string | ISO 8601, Jan 1 of the current year |
| valid_until | string | ISO 8601, Dec 31 of the current year |
| last_deal_published | string \\| null | ISO 8601 date the firm's newest coded deal went live |
| activation_link | string | Direct URL to apply the discount |
| archive_url | string | The firm's page on PropFirmDiscount (source of record) |
| trustpilot_score | number | Optional Trustpilot score |
| trustpilot_reviews | number | Optional Trustpilot review count |
| logo | string | Optional logo URL |

Codes are verified standing exclusive codes checked by the PropFirmDiscount team; the validity window is the current calendar year. last_deal_published is a freshness signal, not a re-check claim.

## Fallbacks

- Source of record: https://propfirmdiscount.com/api/prop-firm-codes/
- GitHub mirror: https://github.com/propfirmdiscounts/prop-firm-discount-codes
- Hugging Face dataset: https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes
`;
}

export function webmcpJs(site) {
  return `// WebMCP tools for ${site.siteName} — read-only, backed by the static dataset.
(function () {
  if (!navigator.modelContext) return;
  var cache = null;
  function load() {
    if (cache) return Promise.resolve(cache);
    return fetch('/dataset.json').then(function (r) { return r.json(); }).then(function (d) {
      cache = Array.isArray(d) ? d : d.data;
      return cache;
    });
  }
  function row(firmName, rows) {
    var q = firmName.toLowerCase();
    return rows.filter(function (r) { return r.prop_firm.toLowerCase().indexOf(q) !== -1; });
  }
  navigator.modelContext.registerTool({
    name: 'get_prop_firm_discount_codes',
    description: 'Return every prop firm with its verified standing exclusive discount code, discount, validity window and activation link.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    execute: function () { return load().then(function (rows) { return { content: [{ type: 'text', text: JSON.stringify(rows) }] }; }); },
  });
  navigator.modelContext.registerTool({
    name: 'search_prop_firm',
    description: 'Search prop firms by name substring and return matching code rows.',
    inputSchema: { type: 'object', properties: { firm_name: { type: 'string', description: 'Firm name substring, e.g. "E8"' } }, required: ['firm_name'] },
    execute: function (args) { return load().then(function (rows) { return { content: [{ type: 'text', text: JSON.stringify(row(args.firm_name, rows)) }] }; }); },
  });
  navigator.modelContext.registerTool({
    name: 'get_firm',
    description: 'Return the code row for one prop firm by name substring.',
    inputSchema: { type: 'object', properties: { firm_name: { type: 'string', description: 'Firm name substring' } }, required: ['firm_name'] },
    execute: function (args) { return load().then(function (rows) { var m = row(args.firm_name, rows); return { content: [{ type: 'text', text: JSON.stringify(m[0] || null) }] }; }); },
  });
})();
`;
}

export function csvOf(rows) {
  const cols = ['prop_firm', 'code', 'discount', 'valid_from', 'valid_until', 'last_deal_published', 'activation_link', 'archive_url', 'trustpilot_score', 'trustpilot_reviews'];
  const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [cols.join(','), ...rows.map((r) => cols.map((c) => q(r[c])).join(','))].join('\n') + '\n';
}

export function webManifest(site) {
  return JSON.stringify({
    name: site.siteName,
    short_name: site.shortName || site.siteName,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [
      { src: '/web-app-manifest-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/web-app-manifest-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2) + '\n';
}

export function headersFile() {
  return `/index.md
  Content-Type: text/markdown; charset=utf-8
/firms/*.md
  Content-Type: text/markdown; charset=utf-8
/llms.txt
  Content-Type: text/plain; charset=utf-8
/ai.txt
  Content-Type: text/plain; charset=utf-8
/firms/*.json
  Content-Type: application/json; charset=utf-8
/dataset.json
  Content-Type: application/json; charset=utf-8
/dataset.csv
  Content-Type: text/csv; charset=utf-8
/.well-known/api-catalog
  Content-Type: application/json; charset=utf-8
/site.webmanifest
  Content-Type: application/manifest+json; charset=utf-8
/favicon.svg
  Content-Type: image/svg+xml
`;
}

// Banned-word gate. The FTC disclosure constant is the one allowed place the
// word "affiliate" appears (it is already public on the main site footer);
// everything else must stay clean of code-mechanics vocabulary.
const BANNED = /is_global_code|partnership|\baffiliate\b(?! commissions)/i;
export function hasBanned(text) {
  return BANNED.test(String(text));
}
export function assertClean(name, text) {
  if (hasBanned(text)) {
    throw new Error(`banned wording in ${name}`);
  }
}
