// Satellite 1 — verification log angle.
import {
  esc, EN_DASH, monthYearUTC, offerShape, titleFor, firmJsonLd, layout,
  DISCLOSURE, robotsTxt, llmsTxt, sitemapXml, aiSitemapXml, apiCatalog,
  skillMd, webmcpJs, csvOf, headersFile, assertClean, parseFirmMirror,
  publisherOrg, webManifest, pctOf,
} from './lib.mjs';

export const site = {
  id: 's1',
  workerName: 'pfd-codecheck',
  domainPlaceholder: 'propfirmcodecheck.example',
  siteName: 'Prop Firm Code Check',
  shortName: 'CodeCheck',
  icons: true,
  tagline: EN_DASH + ' discount code verification log',
  skillName: 'prop-firm-code-check',
  hubBlurb: 'newest code checks first',
  disclosure: DISCLOSURE,
};

// Contact address is derived from the deployed domain so every satellite has
// a reachable, domain-matching inbox (Cloudflare Email Routing forwards it).
function withEmail(site) {
  if (site.email) return site;
  const host = site.origin.replace(/^https?:\/\//, '');
  return { ...site, email: `hello@${host}` };
}

function factsTable(firm, mirror) {
  const o = offerShape(firm.discount);
  const rows = [
    ['Code', `<code>${esc(firm.code)}</code>`],
    ['Discount', esc(o.titlePart || firm.discount || EN_DASH)],
    ['Valid', `${esc(firm.valid_from)} ${esc(EN_DASH)} ${esc(firm.valid_until)} (re-verified yearly)`],
    ['Last deal published', esc(firm.last_deal_published || EN_DASH)],
  ];
  if (firm.trustpilot_score) {
    rows.push(['Trustpilot', `${esc(firm.trustpilot_score)}/5 (${Number(firm.trustpilot_reviews || 0).toLocaleString('en-US')} reviews)`]);
  }
  // The activation link is an affiliate redirect (/go/), so it carries
  // rel="nofollow sponsored" — the disclosure signal search engines expect on
  // paid/affiliate outbound links.
  rows.push(['Apply', `<a rel="nofollow sponsored" href="${esc(firm.activation_link)}">Activate the ${esc(firm.prop_firm)} code</a>`]);
  rows.push(['Data source', `<a href="${esc(firm.archive_url)}">PropFirmDiscount firm page</a>`]);
  return `<table>\n<tbody>\n${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('\n')}\n</tbody>\n</table>`;
}

function dealBridge(firm, mirror) {
  return {
    standing: `This promotion runs on the discount code above ${EN_DASH} <code>${esc(firm.code)}</code> ${EN_DASH} the same code the firm shows for this campaign, still valid any time.`,
    own: `This is a limited-time campaign with its own code and terms; the discount code <code>${esc(firm.code)}</code> above is the one that works any time.`,
    unknown: `This is the firm's newest promotion; the discount code <code>${esc(firm.code)}</code> above is the one that works any time.`,
  }[mirror.dealCodeRelation];
}

// Whether the deal shown in "Latest deal" may print the firm's standing code.
// True for a firm in the mirror-derived standing set whose shown deal is the
// newest one on the standing code, or for a firm on the public exclusive-code
// table whose shown deal's block code is the standing code (its newest deal
// aged out of the 2-month window). The block-code signal alone is not enough:
// a firm outside both sets can still carry an old deal whose code happens to
// equal its dataset code — that is a campaign, not a standing match.
function firmStanding(firm, mirror, standingFirms, exclusiveFirms) {
  if (standingFirms.has(firm.slug) && mirror.dealCodeRelation === 'standing') return true;
  return exclusiveFirms.has(firm.slug) && mirror.blockCodeOnStanding;
}

function currentDealSection(firm, mirror, standingFirms, exclusiveFirms) {
  const d = mirror.latestDeal;
  if (!d) return '';
  const o = offerShape(d.offer);
  const rows = [
    ['Published', `<time datetime="${esc(d.published)}">${esc(d.published)}</time>`],
  ];
  if (d.offer) rows.push(['Offer', esc(o.titlePart || d.offer)]);
  if (d.scope) rows.push(['Scope', esc(d.scope)]);
  // Code row only where the deal shown redeems on the firm's standing code
  // (dealCodeRelation === 'standing'), or where a firm holding an exclusive
  // code shows a deal whose own block code is that standing code — the case
  // where the firm's newest deal has aged out of the 2-month window so the
  // history-derived relation cannot see it, yet the block still points at an
  // older deal that does redeem on the standing code. Standing here means: in
  // the mirror-derived set, or listed on the
  // site's public exclusive-code table. A deal running its own campaign code
  // gets no row.
  if (firmStanding(firm, mirror, standingFirms, exclusiveFirms)) {
    rows.push(['Code', `<code>${esc(firm.code)}</code>`]);
  }
  rows.push(['Deal page', `<a href="${esc(d.dealUrl)}">${esc(d.title)}</a>`]);
  return `<h2 id="deal">Latest deal: ${esc(d.title)}</h2>
<table>
<tbody>
${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('\n')}
</tbody>
</table>
<p>${dealBridge(firm, mirror)}</p>`;
}

function logSection(mirror) {
  if (!mirror.dealHistory.length) return '';
  const items = mirror.dealHistory.map((d) =>
    `<li><time datetime="${esc(d.date)}">${esc(d.date)}</time> ${EN_DASH} ${esc(d.offer)}: <a href="${esc(d.url)}">${esc(d.title)}</a></li>`).join('\n');
  return `<h2 id="log">Code check log</h2>
<p>Each entry is a dated deal that carried a code ${EN_DASH} the check trail behind the rate above. Newest first.</p>
<ol class="log">
${items}
</ol>`;
}

function faqSection(firm, mirror) {
  if (!mirror.faq.length) return '';
  const blocks = mirror.faq.slice(0, 4).map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n');
  const heading = mirror.latestDeal ? `${mirror.latestDeal.title} FAQ` : `${firm.prop_firm} code FAQ`;
  const note = `<p>These questions cover the promotion described above. The discount code is separate ${EN_DASH} it keeps working after the campaign ends.</p>\n`;
  return `<h2 id="faq">${esc(heading)}</h2>\n${note}${blocks}`;
}

export function firmPage(site, firm, mirror, now, standingFirms, exclusiveFirms) {
  const title = titleFor(firm, now);
  const o = offerShape(firm.discount);
  const ldDeal = mirror.latestDeal;
  const promotion = ldDeal ? ` Its newest promotion, ${ldDeal.title}${ldDeal.published ? ` (published ${ldDeal.published})` : ''}, is detailed below.` : '';
  const desc = `${firm.prop_firm} discount code ${firm.code} gives ${o.sentence || 'a discount'} and works any time ${EN_DASH} checked ${monthYearUTC(now)} by the PropFirmDiscount team. Last deal ${firm.last_deal_published || 'n/a'}.`.slice(0, 300);
  const path = `/firms/${firm.slug}`;
  const ld = firmJsonLd(site, firm, title, desc, now);
  const body = `<nav class="crumb"><a href="/">All firms</a> ${EN_DASH} ${esc(firm.prop_firm)}</nav>
<h1>${esc(firm.prop_firm)} Discount Code</h1>
<p class="answer">The discount code for ${esc(firm.prop_firm)} is <code class="chip" data-code="${esc(firm.code)}">${esc(firm.code)}</code>${o.sentence ? ` ${EN_DASH} ${esc(o.sentence)}` : ''}, works any time. Checked by our team when ${esc(firm.prop_firm)}'s newest deal was published${firm.last_deal_published ? ` (${esc(firm.last_deal_published)})` : ''}.${promotion}</p>
${factsTable(firm, mirror)}
${logSection(mirror)}
${currentDealSection(firm, mirror, standingFirms, exclusiveFirms)}
${faqSection(firm, mirror)}`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}${path}/`, ld, body, path }) };
}

export function firmTwins(site, firm, mirror, now, standingFirms, exclusiveFirms) {
  const o = offerShape(firm.discount);
  const md = [`# ${firm.prop_firm} Discount Code`, '',
    `The discount code for ${firm.prop_firm} is **${firm.code}**${o.sentence ? ` ${EN_DASH} ${o.sentence}` : ''}, works any time. Checked ${monthYearUTC(now)} by the PropFirmDiscount team.`, ''];
  if (mirror.summary) md.push(`> ${mirror.summary}`, '');
  md.push(`- Code: ${firm.code}`, `- Discount: ${o.titlePart || firm.discount}`, `- Valid: ${firm.valid_from} to ${firm.valid_until}`, `- Last deal published: ${firm.last_deal_published || 'n/a'}`);
  if (firm.trustpilot_score) md.push(`- Trustpilot: ${firm.trustpilot_score}/5 (${firm.trustpilot_reviews} reviews)`);
  md.push(`- Activate: ${firm.activation_link}`, `- Source of record: ${firm.archive_url}`, '');
  const ldDeal = mirror.latestDeal;
  if (mirror.dealHistory.length) {
    md.push('## Code check log (newest first)', '');
    for (const d of mirror.dealHistory) md.push(`- ${d.date} - [${d.title}](${d.url}) (${d.offer})`);
    md.push('');
  }
  if (ldDeal) {
    md.push(`## Latest deal: ${ldDeal.title}`, '');
    md.push(`- Published: ${ldDeal.published}`);
    if (ldDeal.offer) md.push(`- Offer: ${offerShape(ldDeal.offer).titlePart || ldDeal.offer}`);
    if (ldDeal.scope) md.push(`- Scope: ${ldDeal.scope}`);
    // Same gate as the page: the Code line appears only where the deal shown
    // redeems on the firm's standing code, and only for a firm that holds one.
    if (firmStanding(firm, mirror, standingFirms, exclusiveFirms)) {
      md.push(`- Code: ${firm.code}`);
    }
    md.push(`- Deal page: ${ldDeal.dealUrl}`, '');
    // The shown deal redeems on the standing code whenever the Code row was
    // allowed above, so report that relation (not the history-only one, which
    // reads 'unknown' once the newest deal ages out of the window).
    const relation = firmStanding(firm, mirror, standingFirms, exclusiveFirms) ? 'standing' : mirror.dealCodeRelation;
    md.push({
      standing: `This promotion runs on the discount code ${firm.code} above — the same code the firm shows for this campaign, still valid any time.`,
      own: `This is a limited-time campaign with its own code and terms; the discount code ${firm.code} above is the one that works any time.`,
      unknown: `This is the firm's newest promotion; the discount code ${firm.code} above is the one that works any time.`,
    }[relation], '');
  }
  if (mirror.faq.length) {
    md.push(`## ${ldDeal ? `${ldDeal.title} FAQ` : `${firm.prop_firm} code FAQ`}`, '');
    md.push(`These questions cover the promotion described above. The discount code is separate ${EN_DASH} it keeps working after the campaign ends.`, '');
    for (const f of mirror.faq.slice(0, 4)) md.push(`**${f.q}**`, '', f.a, '');
  }
  const json = {
    url: `${site.origin}/firms/${firm.slug}/`,
    name: firm.prop_firm,
    code: firm.code,
    discount: firm.discount,
    valid_from: firm.valid_from,
    valid_until: firm.valid_until,
    last_deal_published: firm.last_deal_published,
    last_checked: monthYearUTC(now),
    trustpilot: firm.trustpilot_score ? { score: firm.trustpilot_score, reviews: firm.trustpilot_reviews } : null,
    source: 'propfirmdiscount.com',
    activation_link: firm.activation_link,
    current_deal: ldDeal ? { title: ldDeal.title, published: ldDeal.published, offer: ldDeal.offer, scope: ldDeal.scope, deal_url: ldDeal.dealUrl, code_relation: firmStanding(firm, mirror, standingFirms, exclusiveFirms) ? 'standing' : mirror.dealCodeRelation } : null,
    changelog: mirror.dealHistory,
  };
  return { md: md.join('\n'), json: JSON.stringify(json, null, 2) };
}

// ── hub activity sections ───────────────────────────────────────
// Every firm mirror carries a dated deal history; the hub surfaces it so the
// page answers "what is actually moving" without the reader opening 49 pages.
// History rows carry no code at all, so nothing sensitive can leak here.
function dealPool(rows, mirrors) {
  const pool = [];
  for (const r of rows) {
    const m = mirrors[r.slug];
    if (!m) continue;
    for (const d of m.dealHistory) {
      pool.push({ date: d.date, firm: r.prop_firm, slug: r.slug, code: r.code, title: d.title, url: d.url, offer: d.offer, pct: pctOf(d.offer) });
    }
  }
  pool.sort((a, b) => b.date.localeCompare(a.date) || a.firm.localeCompare(b.firm));
  return pool;
}

const monthKey = (date) => String(date || '').slice(0, 7);

function monthLabel(ym) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ym}-01T00:00:00Z`));
}

// The last two calendar months ending at `now` (this month and the one
// before), newest first. Months with no recorded deal still appear as 0 —
// the log reports quiet stretches honestly.
function trailingMonths(now) {
  const out = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = 0; i < 2; i++) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function activityStats(pool, now) {
  const months = trailingMonths(now);
  const inWindow = pool.filter((r) => months.includes(monthKey(r.date)));
  const byMonth = months.map((ym) => {
    const rows = inWindow.filter((r) => monthKey(r.date) === ym);
    return { ym, deals: rows.length, firms: new Set(rows.map((r) => r.slug)).size };
  });
  const byFirm = new Map();
  for (const r of inWindow) {
    const cur = byFirm.get(r.slug) || { slug: r.slug, firm: r.firm, code: r.code, count: 0, best: null, last: r.date };
    cur.count++;
    if (r.pct !== null && (cur.best === null || r.pct > cur.best)) cur.best = r.pct;
    if (r.date > cur.last) cur.last = r.date;
    byFirm.set(r.slug, cur);
  }
  const topFirms = [...byFirm.values()]
    .sort((a, b) => b.count - a.count || (b.best ?? -1) - (a.best ?? -1) || a.firm.localeCompare(b.firm))
    .slice(0, 10);
  const dates = pool.map((r) => r.date).sort();
  return {
    months: byMonth,
    topFirms,
    total: pool.length,
    first: dates[0] || null,
    last: dates[dates.length - 1] || null,
    windowFirms: byFirm.size,
  };
}

export function hubPage(site, rows, mirrors, now, standingFirms) {
  const sorted = [...rows].sort((a, b) => String(b.last_deal_published || '').localeCompare(String(a.last_deal_published || '')));
  const title = `Prop Firm Discount Code Checks ${EN_DASH} ${monthYearUTC(now)}`;
  const desc = `Verification log of ${rows.length} verified prop firm discount codes, newest checks first, with the dated deal trail behind each code. Updated ${monthYearUTC(now)}.`;
  const pool = dealPool(rows, mirrors);
  const stats = activityStats(pool, now);
  const latest = pool.slice(0, 15);
  // A code is printed only where the mirror chain says the deal renders on the
  // firm's standing code (the same signal the event hub reads). Everywhere else
  // the deal carries its own campaign code, so the cell stays blank.
  const codeCell = (slug, code) => (standingFirms.has(slug) ? `<td data-code-state="standing"><code>${esc(code)}</code></td>` : '<td></td>');
  const rowOf = (r) => `<tr>
<td><a href="/firms/${r.slug}/">${esc(r.prop_firm)}</a></td>
<td><code>${esc(r.code)}</code></td>
<td>${esc(offerShape(r.discount).titlePart || r.discount || EN_DASH)}</td>
<td>${esc(monthYearUTC(now))}</td>
<td>${r.last_deal_published ? `<time datetime="${esc(r.last_deal_published)}">${esc(r.last_deal_published)}</time>` : EN_DASH}</td>
</tr>`;
  const table = `<div class="tscroll w560"><table class="checks">
<thead><tr><th scope="col">Firm</th><th scope="col">Code</th><th scope="col">Discount</th><th scope="col">Checked</th><th scope="col">Last deal</th></tr></thead>
<tbody>
${sorted.map(rowOf).join('\n')}
</tbody>
</table></div>`;
  const latestSection = latest.length ? `<h2 id="latest">Latest deals across tracked firms</h2>
<p>The ${latest.length} most recent coded deals published by the firms on this list, newest first ${EN_DASH} the dated trail behind the checks above. Dates are the firms' publish dates, not re-test dates. The Code column prints the firm's discount code where the deal redeems on it; blank rows carry the deal's own limited-time campaign code, which you copy from the deal page the row links to.</p>
<div class="tscroll w560"><table class="checks">
<thead><tr><th scope="col">Published</th><th scope="col">Firm</th><th scope="col">Deal</th><th scope="col">Offer</th><th scope="col">Code</th></tr></thead>
<tbody>
${latest.map((d) => `<tr>
<td><time datetime="${esc(d.date)}">${esc(d.date)}</time></td>
<td><a href="/firms/${d.slug}/">${esc(d.firm)}</a></td>
<td><a rel="nofollow" href="${esc(d.url)}">${esc(d.title)}</a></td>
<td>${esc(offerShape(d.offer).titlePart || d.offer || EN_DASH)}</td>
${codeCell(d.slug, d.code)}
</tr>`).join('\n')}
</tbody>
</table></div>` : '';
  const monthRows = stats.months.map((m) => `<tr>
<td>${esc(monthLabel(m.ym))}</td>
<td>${m.deals}</td>
<td>${m.firms}</td>
</tr>`).join('\n');
  const firmRows = stats.topFirms.map((f) => `<tr>
<td><a href="/firms/${f.slug}/">${esc(f.firm)}</a></td>
<td>${f.count}</td>
<td>${f.best === null ? EN_DASH : `${f.best}%`}</td>
<td><time datetime="${esc(f.last)}">${esc(f.last)}</time></td>
${codeCell(f.slug, f.code)}
</tr>`).join('\n');
  const activitySection = stats.total ? `<h2 id="activity">Tracking activity</h2>
<p>Counting only deals the firms published with a date on them: ${stats.total} dated deals across ${rows.length} tracked firms in the last two months, running from ${esc(stats.first)} to ${esc(stats.last)}. Updated ${esc(monthYearUTC(now))}.</p>
<h3>Deals recorded by month</h3>
<p>The last two calendar months. Months with no recorded deal show 0 ${EN_DASH} the log does not hide quiet stretches.</p>
<div class="tscroll w480"><table class="checks">
<thead><tr><th scope="col">Month</th><th scope="col">Deals</th><th scope="col">Firms active</th></tr></thead>
<tbody>
${monthRows}
</tbody>
</table></div>
<h3>Most active firms</h3>
<p>Ranked by deals published over those same two months, then by best percentage offer. The Code column carries a firm's discount code where its deals redeem on it, and stays blank for firms running their own campaign codes.</p>
<div class="tscroll w640"><table class="checks">
<thead><tr><th scope="col">Firm</th><th scope="col">Deals (2 mo)</th><th scope="col">Best offer</th><th scope="col">Last deal</th><th scope="col">Code</th></tr></thead>
<tbody>
${firmRows}
</tbody>
</table></div>` : '';
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${site.origin}/#website`, url: site.origin, name: site.siteName, publisher: { '@id': `${site.origin}/#org` } },
      publisherOrg(site),
      {
        '@type': 'CollectionPage', '@id': `${site.origin}/`, url: `${site.origin}/`, name: title, description: desc,
        dateModified: now.toISOString().slice(0, 10),
        isPartOf: { '@id': `${site.origin}/#website` },
        mainEntity: {
          '@type': 'ItemList', numberOfItems: sorted.length,
          itemListElement: sorted.map((r, i) => ({
            '@type': 'ListItem', position: i + 1, url: `${site.origin}/firms/${r.slug}/`,
            name: `${r.prop_firm} discount code ${r.code}`,
          })),
        },
      },
    ],
  };
  const body = `<h1>Prop Firm Discount Code Checks</h1>
<p class="answer">This log tracks ${rows.length} verified prop firm discount codes, newest check first. Every entry links to a firm page with the code, its validity window and the dated deal trail behind it.</p>
<h2 id="log">Checks, newest first</h2>
${table}
${latestSection}
${activitySection}
<h2 id="method">About this site and how codes are checked</h2>
<p>${esc(site.siteName)} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022. Every code listed here is a discount code the team maintains with each firm; the code works any time, not only during a campaign window.</p>
<p>What a check entry means: when a firm publishes a new coded deal, the team confirms the code still applies and records the deal here with its publish date. The date you see is the deal's publish date ${EN_DASH} it is not a claim that the code was re-tested that day. Validity windows follow the current calendar year and roll over every January 1.</p>
<p>Corrections welcome: email <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> and the entry is updated in the next hourly rebuild. Full dataset and methodology notes: <a href="/dataset.json">dataset.json</a>, <a href="/llms.txt">llms.txt</a>.</p>`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}/`, ld, body, path: null, altMarkdown: '/md' }) };
}

// Machine twin of the hub. Same rows as the page, as a markdown table so an
// agent can read the whole log in one fetch.
export function hubMarkdown(site, rows, mirrors, now, standingFirms) {
  const sorted = [...rows].sort((a, b) => String(b.last_deal_published || '').localeCompare(String(a.last_deal_published || '')));
  const pool = dealPool(rows, mirrors);
  const stats = activityStats(pool, now);
  const latest = pool.slice(0, 15);
  const code = (slug, value) => (standingFirms.has(slug) ? value : '');
  const md = [`# Prop Firm Discount Code Checks`, '',
    `This log tracks ${rows.length} verified prop firm discount codes, newest check first. Every entry links to a firm page with the code, its validity window and the dated deal trail behind it.`, '',
    `## Checks, newest first`, '',
    `| Firm | Code | Discount | Checked | Last deal |`,
    `|------|------|----------|---------|-----------|`];
  for (const r of sorted) {
    md.push(`| [${r.prop_firm}](${site.origin}/firms/${r.slug}/) | ${r.code} | ${offerShape(r.discount).titlePart || r.discount || EN_DASH} | ${monthYearUTC(now)} | ${r.last_deal_published || EN_DASH} |`);
  }
  if (latest.length) {
    md.push('', `## Latest deals across tracked firms`, '',
      `The ${latest.length} most recent coded deals published by the firms on this list, newest first ${EN_DASH} the dated trail behind the checks above. Dates are the firms' publish dates, not re-test dates. The Code column prints the firm's discount code where the deal redeems on it; blank rows carry the deal's own limited-time campaign code, which you copy from the deal page the row links to.`, '',
      `| Published | Firm | Deal | Offer | Code |`,
      `|-----------|------|------|-------|------|`);
    for (const d of latest) {
      md.push(`| ${d.date} | [${d.firm}](${site.origin}/firms/${d.slug}/) | [${d.title}](${d.url}) | ${offerShape(d.offer).titlePart || d.offer || EN_DASH} | ${code(d.slug, d.code)} |`);
    }
  }
  if (stats.total) {
    md.push('', `## Tracking activity`, '',
      `Counting only deals the firms published with a date on them: ${stats.total} dated deals across ${rows.length} tracked firms in the last two months, running from ${stats.first} to ${stats.last}. Updated ${monthYearUTC(now)}.`, '',
      `### Deals recorded by month`, '',
      `The last two calendar months. Months with no recorded deal show 0 ${EN_DASH} the log does not hide quiet stretches.`, '',
      `| Month | Deals | Firms active |`,
      `|-------|-------|--------------|`);
    for (const m of stats.months) md.push(`| ${monthLabel(m.ym)} | ${m.deals} | ${m.firms} |`);
    md.push('', `### Most active firms`, '',
      `Ranked by deals published over those same two months, then by best percentage offer. The Code column carries a firm's discount code where its deals redeem on it, and stays blank for firms running their own campaign codes.`, '',
      `| Firm | Deals (2 mo) | Best offer | Last deal | Code |`,
      `|------|---------------|------------|-----------|------|`);
    for (const f of stats.topFirms) md.push(`| [${f.firm}](${site.origin}/firms/${f.slug}/) | ${f.count} | ${f.best === null ? EN_DASH : `${f.best}%`} | ${f.last} | ${code(f.slug, f.code)} |`);
  }
  md.push('', '## About this site and how codes are checked', '',
    `${site.siteName} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022. Every code listed here is a discount code the team maintains with each firm; the code works any time, not only during a campaign window.`, '',
    `What a check entry means: when a firm publishes a new coded deal, the team confirms the code still applies and records the deal here with its publish date. The date you see is the deal's publish date ${EN_DASH} it is not a claim that the code was re-tested that day. Validity windows follow the current calendar year and roll over every January 1.`, '',
    `Corrections welcome: ${site.email}. Full dataset: ${site.origin}/dataset.json. Methodology notes: ${site.origin}/llms.txt.`);
  return md.join('\n') + '\n';
}

export function buildSite(siteIn, rows, mirrors, now, out, standingFirms, exclusiveFirms) {
  const site = withEmail(siteIn);
  const files = {};
  const htmlPaths = ['/'];
  for (const firm of rows) {
    const mirror = mirrors[firm.slug] || { lead: '', summary: '', bullets: {}, dealHistory: [], faq: [] };
    const page = firmPage(site, firm, mirror, now, standingFirms, exclusiveFirms);
    const twins = firmTwins(site, firm, mirror, now, standingFirms, exclusiveFirms);
    files[`firms/${firm.slug}/index.html`] = page.html;
    files[`firms/${firm.slug}.md`] = twins.md;
    files[`firms/${firm.slug}.json`] = twins.json;
    htmlPaths.push(`/firms/${firm.slug}/`);
  }
  const hub = hubPage(site, rows, mirrors, now, standingFirms);
  files['index.html'] = hub.html;
  files['md'] = hubMarkdown(site, rows, mirrors, now, standingFirms);
  files['dataset.json'] = JSON.stringify({ dataset: 'prop-firm-codes', publisher: site.siteName, count: rows.length, generated: now.toISOString().slice(0, 10), data: rows }, null, 2);
  files['dataset.csv'] = csvOf(rows);
  files['robots.txt'] = robotsTxt(site);
  files['llms.txt'] = llmsTxt(site, rows, now);
  files['ai.txt'] = `Website: ${site.origin}\nDataset: ${site.origin}/dataset.json\n\nREAD THIS FIRST: this site is a static mirror of the PropFirmDiscount dataset.\nSource of record: https://propfirmdiscount.com/\nGitHub mirror: https://github.com/propfirmdiscounts/prop-firm-discount-codes\nHugging Face dataset: https://huggingface.co/datasets/propfirmdiscounts/prop-firm-discount-codes\n`;
  const lastmod = now.toISOString().slice(0, 10);
  files['sitemap.xml'] = sitemapXml(site, htmlPaths, lastmod);
  files['ai-sitemap.xml'] = aiSitemapXml(site, ['/md', '/dataset.json', '/dataset.csv', '/llms.txt', `/.well-known/agent-skills/${site.skillName}/SKILL.md`, ...rows.map((r) => `/firms/${r.slug}.json`)], lastmod);
  files['.well-known/api-catalog'] = apiCatalog(site);
  files[`.well-known/agent-skills/${site.skillName}/SKILL.md`] = skillMd(site, rows);
  files['webmcp.js'] = webmcpJs(site);
  files['_headers'] = headersFile();
  // The hub markdown twin moved from /index.md to /md (the main site's own
  // convention, and the only form that is not shadowed by index.html under
  // auto-trailing-slash). Keep the old address working for anything that
  // already fetched it.
  files['_redirects'] = '/index.md /md 301\n';
  if (site.icons) files['site.webmanifest'] = webManifest(site);
  for (const [name, text] of Object.entries(files)) assertClean(name, text);
  Object.assign(out, files);
  return Object.keys(files).length;
}

export { parseFirmMirror };
