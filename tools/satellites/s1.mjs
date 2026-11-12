// Satellite 1 — verification log angle.
import {
  esc, EN_DASH, monthYearUTC, offerShape, titleFor, firmJsonLd, layout,
  DISCLOSURE, robotsTxt, llmsTxt, sitemapXml, aiSitemapXml, apiCatalog,
  skillMd, webmcpJs, csvOf, headersFile, assertClean, parseFirmMirror,
  publisherOrg, webManifest, pctOf, lastDealDate, validityLabel,
} from './lib.mjs';

export const site = {
  id: 's1',
  workerName: 'pfd-codecheck',
  domainPlaceholder: 'propfirmcodecheck.example',
  siteName: 'Prop Firm Code Check',
  shortName: 'CodeCheck',
  icons: true,
  ga: 'G-0RHJRGQ5LM',
  tagline: EN_DASH + ' discount code verification log',
  skillName: 'prop-firm-code-check',
  hubBlurb: 'ranked highest to lowest discount',
  disclosure: DISCLOSURE,
};

// Contact address is derived from the deployed domain so every satellite has
// a reachable, domain-matching inbox (Cloudflare Email Routing forwards it).
function withEmail(site) {
  if (site.email) return site;
  const host = site.origin.replace(/^https?:\/\//, '');
  return { ...site, email: `info@${host}` };
}

function factsTable(firm, mirror) {
  const o = offerShape(firm.discount);
  const dealDate = lastDealDate(firm);
  const rows = [
    ['Code', `<code>${esc(firm.code)}</code>`],
    ['Discount', esc(o.titlePart || firm.discount || EN_DASH)],
    ['Valid', esc(validityLabel(firm))],
    ['Last deal published', dealDate ? `<time datetime="${esc(dealDate)}">${esc(dealDate)}</time>` : EN_DASH],
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
  const isStandingDeal = firmStanding(firm, mirror, standingFirms, exclusiveFirms);
  const dealTitle = isStandingDeal && !/\bwith code\b/i.test(d.title)
    ? `${d.title} with code ${firm.code}`
    : d.title;
  if (isStandingDeal) {
    rows.push(['Code', `<code>${esc(firm.code)}</code>`]);
  }
  rows.push(['Deal page', `<a href="${esc(d.dealUrl)}">${esc(dealTitle)}</a>`]);
  return `<h2 id="deal">Latest deal: ${esc(dealTitle)}</h2>
<table>
<tbody>
${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('\n')}
</tbody>
</table>
<p>${dealBridge(firm, mirror)}</p>`;
}

function logSection(firm, mirror, standingFirms) {
  if (!mirror.dealHistory.length) return '';
  const items = mirror.dealHistory.map((d) => {
    const title = dealTitleFor({ title: d.title, slug: firm.slug, code: firm.code }, standingFirms);
    return `<li><time datetime="${esc(d.date)}">${esc(d.date)}</time> ${EN_DASH} ${esc(d.offer)}: <a href="${esc(d.url)}">${esc(title)}</a></li>`;
  }).join('\n');
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
  const year = now.getUTCFullYear();
  const o = offerShape(firm.discount);
  const dealDate = lastDealDate(firm);
  const ldDeal = mirror.latestDeal;
  const promotion = ldDeal ? ` Its newest promotion, ${ldDeal.title}${ldDeal.published ? ` (published ${ldDeal.published})` : ''}, is detailed below.` : '';
  const desc = `${firm.prop_firm} discount code ${firm.code} gives ${o.sentence || 'a discount'} and works any time ${EN_DASH} checked ${monthYearUTC(now)} by the PropFirmDiscount team. Last deal ${dealDate || 'n/a'}.`.slice(0, 300);
  const path = `/firms/${firm.slug}`;
  const ld = firmJsonLd(site, firm, title, desc, now);
  const body = `<nav class="crumb"><a href="/">All firms</a> ${EN_DASH} ${esc(firm.prop_firm)}</nav>
<h1>${esc(firm.prop_firm)} Discount Code ${year}</h1>
<p class="answer">The discount code for ${esc(firm.prop_firm)} is ${esc(firm.code)}${o.sentence ? ` ${EN_DASH} ${esc(o.sentence)}` : ''}, works any time. Checked by our team when ${esc(firm.prop_firm)}'s newest deal was published${dealDate ? ` (${esc(dealDate)})` : ''}.${promotion}</p>
${factsTable(firm, mirror)}
${logSection(firm, mirror, standingFirms)}
${currentDealSection(firm, mirror, standingFirms, exclusiveFirms)}
${faqSection(firm, mirror)}`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}${path}/`, ld, body, path }) };
}

export function firmTwins(site, firm, mirror, now, standingFirms, exclusiveFirms) {
  const o = offerShape(firm.discount);
  const year = now.getUTCFullYear();
  const dealDate = lastDealDate(firm);
  const md = [`# ${firm.prop_firm} Discount Code ${year}`, '',
    `The discount code for ${firm.prop_firm} is ${firm.code}${o.sentence ? ` ${EN_DASH} ${o.sentence}` : ''}, works any time. Checked ${monthYearUTC(now)} by the PropFirmDiscount team.`, ''];
  if (mirror.summary) md.push(`> ${mirror.summary}`, '');
  md.push(`- Code: ${firm.code}`, `- Discount: ${o.titlePart || firm.discount}`, `- Valid: ${validityLabel(firm)}`, `- Last deal published: ${dealDate || 'n/a'}`);
  if (firm.trustpilot_score) md.push(`- Trustpilot: ${firm.trustpilot_score}/5 (${firm.trustpilot_reviews} reviews)`);
  md.push(`- Activate: ${firm.activation_link}`, `- Source of record: ${firm.archive_url}`, '');
  const ldDeal = mirror.latestDeal;
  if (mirror.dealHistory.length) {
    md.push('## Code check log (newest first)', '');
    for (const d of mirror.dealHistory) {
      const dealTitle = dealTitleFor({ title: d.title, slug: firm.slug, code: firm.code }, standingFirms);
      md.push(`- ${d.date} - [${dealTitle}](${d.url}) (${d.offer})`);
    }
    md.push('');
  }
  if (ldDeal) {
    const isStandingDeal = firmStanding(firm, mirror, standingFirms, exclusiveFirms);
    const ldTitle = isStandingDeal && !/\bwith code\b/i.test(ldDeal.title)
      ? `${ldDeal.title} with code ${firm.code}`
      : ldDeal.title;
    md.push(`## Latest deal: ${ldTitle}`, '');
    md.push(`- Published: ${ldDeal.published}`);
    if (ldDeal.offer) md.push(`- Offer: ${offerShape(ldDeal.offer).titlePart || ldDeal.offer}`);
    if (ldDeal.scope) md.push(`- Scope: ${ldDeal.scope}`);
    // Same gate as the page: the Code line appears only where the deal shown
    // redeems on the firm's standing code, and only for a firm that holds one.
    if (isStandingDeal) {
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
    validity: firm.validity || 'standing',
    last_deal_published: dealDate,
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

function sortHubRows(rows) {
  return [...rows].sort((a, b) => {
    const pa = pctOf(a.discount);
    const pb = pctOf(b.discount);
    if (pa !== null && pb !== null && pb !== pa) return pb - pa;
    if (pa !== null && pb === null) return -1;
    if (pa === null && pb !== null) return 1;
    const da = String(lastDealDate(a) || '');
    const db = String(lastDealDate(b) || '');
    if (db !== da) return db.localeCompare(da);
    return a.prop_firm.localeCompare(b.prop_firm);
  });
}

function joinEnglishList(parts) {
  if (parts.length <= 1) return parts[0] || '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function monthSpanLabel(months) {
  const ordered = [...months].reverse();
  if (ordered.length !== 2) return ordered.map((m) => monthLabel(m.ym)).join(', ');
  const [a, b] = ordered.map((m) => {
    const [y, mo] = m.ym.split('-');
    const name = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(`${m.ym}-01T00:00:00Z`));
    return { y, name, full: `${name} ${y}` };
  });
  return a.y === b.y ? `${a.name} and ${b.name} ${b.y}` : `${a.full} and ${b.full}`;
}

function hubAnswerParts(sorted, now, html = false) {
  const top5 = sorted.filter((r) => pctOf(r.discount) !== null).slice(0, 5);
  const items = top5.map((r) => {
    const pct = pctOf(r.discount);
    const code = html ? `<code>${esc(r.code)}</code>` : r.code;
    const firm = html ? esc(r.prop_firm) : r.prop_firm;
    return `${pct}% OFF with code ${code} at ${firm}`;
  });
  const lead = items.length ? `As of ${monthYearUTC(now)}, the biggest current prop firm discounts are ${joinEnglishList(items)}. ` : '';
  return {
    answer: `${lead}Explore all ${sorted.length} prop firm discount codes, compare available savings, and browse each firm's discount history.`,
    note: "All promo codes are free to use, and you'll receive the same discount whether you use our activation link or visit the prop firm's website directly.",
  };
}

function dealTitleFor(d, standingFirms) {
  if (standingFirms.has(d.slug) && !/\bwith code\b/i.test(d.title)) {
    return `${d.title} with code ${d.code}`;
  }
  return d.title;
}

export function hubPage(site, rows, mirrors, now, standingFirms) {
  const sorted = sortHubRows(rows);
  const title = `Prop Firm Discount Code Checks ${EN_DASH} ${monthYearUTC(now)}`;
  const desc = `Verification log of ${rows.length} verified prop firm discount codes, ranked highest to lowest discount, with the dated deal trail behind each code. Updated ${monthYearUTC(now)}.`;
  const pool = dealPool(rows, mirrors);
  const stats = activityStats(pool, now);
  const latest = pool.slice(0, 15);
  const rowOf = (r) => {
    const d = lastDealDate(r);
    return `<tr>
<td><a href="/firms/${r.slug}/">${esc(r.prop_firm)}</a></td>
<td><code>${esc(r.code)}</code></td>
<td>${esc(offerShape(r.discount).titlePart || r.discount || EN_DASH)}</td>
<td>${esc(monthYearUTC(now))}</td>
<td>${d ? `<time datetime="${esc(d)}">${esc(d)}</time>` : EN_DASH}</td>
</tr>`;
  };
  const table = `<div class="tscroll w560"><table class="checks">
<thead><tr><th scope="col">Firm</th><th scope="col">Code</th><th scope="col">Discount</th><th scope="col">Checked</th><th scope="col">Last deal</th></tr></thead>
<tbody>
${sorted.map(rowOf).join('\n')}
</tbody>
</table></div>`;
  const latestSection = latest.length ? `<h2 id="latest">Latest Prop Firm Deals &amp; Promotions</h2>
<p>Browse the ${latest.length} most recent promotional deals published by tracked prop firms, ranked by publication date. Each record links to its original deal page, providing a dated history of promotional campaigns, advertised discounts, and special offers. Dates are the firms' publish dates, not re-test dates. Deals that redeem on the firm's standing discount code include it in the deal title; other deals carry their own limited-time campaign code on the linked deal page.</p>
<div class="tscroll w560"><table class="checks">
<thead><tr><th scope="col">Published</th><th scope="col">Firm</th><th scope="col">Deal</th><th scope="col">Offer</th></tr></thead>
<tbody>
${latest.map((d) => `<tr>
<td><time datetime="${esc(d.date)}">${esc(d.date)}</time></td>
<td><a href="/firms/${d.slug}/">${esc(d.firm)}</a></td>
<td><a rel="nofollow" href="${esc(d.url)}">${esc(dealTitleFor(d, standingFirms))}</a></td>
<td>${esc(offerShape(d.offer).titlePart || d.offer || EN_DASH)}</td>
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
<td><code>${esc(f.code)}</code></td>
</tr>`).join('\n');
  const activitySection = stats.total ? `<h2 id="activity">Prop Firm Discount &amp; Promotion Statistics</h2>
<p>Counting only deals the firms published with a date on them: ${stats.total} dated deals across ${rows.length} tracked firms in the last two months, running from ${esc(stats.first)} to ${esc(stats.last)}. Updated ${esc(monthYearUTC(now))}.</p>
<h3>Monthly Prop Firm Deal Statistics</h3>
<p>The last two calendar months. Months with no recorded deal show 0 ${EN_DASH} the log does not hide quiet stretches.</p>
<div class="tscroll w480"><table class="checks">
<thead><tr><th scope="col">Month</th><th scope="col">Deals</th><th scope="col">Firms active</th></tr></thead>
<tbody>
${monthRows}
</tbody>
</table></div>
<h3>Most Active Prop Firms by Promotional Activity</h3>
<p>Track promotional activity across ${rows.length} proprietary trading firms using ${stats.total} dated deal records from ${esc(monthSpanLabel(stats.months))}. Explore monthly promotion counts, compare firm activity, and identify which proprietary trading firms have published the most deals recently.</p>
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
  const ans = hubAnswerParts(sorted, now, true);
  const body = `<h1>${esc(title)}</h1>
<p class="answer">${ans.answer}</p>
<p>${ans.note}</p>
<h2 id="log">Prop Firm Discount Codes ${EN_DASH} Ranked by Discount</h2>
${table}
${latestSection}
${activitySection}
<h2 id="method">About this site and how codes are checked</h2>
<p>${esc(site.siteName)} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022.</p>
<p>Every listed code is maintained as a standing discount code associated with its respective prop firm, rather than a code limited to a specific promotional campaign.</p>
<p>When a firm publishes a new deal featuring a discount code, the team confirms whether the standing code still applies and records the deal with its original publication date.</p>
<p>The date displayed in the deal history represents the firm's publication date, not the date the standing code was independently re-tested. Listed codes have no published expiry date, but availability and terms may change.</p>
<p>Corrections are welcome at <a href="mailto:${esc(site.email)}">${esc(site.email)}</a>. Verified corrections are reflected in the next hourly database rebuild.</p>
<p>Full dataset and methodology notes: <a href="/dataset.json">dataset.json</a> and <a href="/llms.txt">llms.txt</a>.</p>`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}/`, ld, body, path: null, altMarkdown: '/md' }) };
}

// Machine twin of the hub. Same rows as the page, as a markdown table so an
// agent can read the whole log in one fetch.
export function hubMarkdown(site, rows, mirrors, now, standingFirms) {
  const sorted = sortHubRows(rows);
  const pool = dealPool(rows, mirrors);
  const stats = activityStats(pool, now);
  const latest = pool.slice(0, 15);
  const ans = hubAnswerParts(sorted, now, false);
  const md = [`# Prop Firm Discount Code Checks ${EN_DASH} ${monthYearUTC(now)}`, '',
    ans.answer, '',
    ans.note, '',
    `## Prop Firm Discount Codes ${EN_DASH} Ranked by Discount`, '',
    `| Firm | Code | Discount | Checked | Last deal |`,
    `|------|------|----------|---------|-----------|`];
  for (const r of sorted) {
    md.push(`| [${r.prop_firm}](${site.origin}/firms/${r.slug}/) | ${r.code} | ${offerShape(r.discount).titlePart || r.discount || EN_DASH} | ${monthYearUTC(now)} | ${lastDealDate(r) || EN_DASH} |`);
  }
  if (latest.length) {
    md.push('', `## Latest Prop Firm Deals & Promotions`, '',
      `Browse the ${latest.length} most recent promotional deals published by tracked prop firms, ranked by publication date. Each record links to its original deal page, providing a dated history of promotional campaigns, advertised discounts, and special offers. Dates are the firms' publish dates, not re-test dates. Deals that redeem on the firm's standing discount code include it in the deal title; other deals carry their own limited-time campaign code on the linked deal page.`, '',
      `| Published | Firm | Deal | Offer |`,
      `|-----------|------|------|-------|`);
    for (const d of latest) {
      md.push(`| ${d.date} | [${d.firm}](${site.origin}/firms/${d.slug}/) | [${dealTitleFor(d, standingFirms)}](${d.url}) | ${offerShape(d.offer).titlePart || d.offer || EN_DASH} |`);
    }
  }
  if (stats.total) {
    md.push('', `## Prop Firm Discount & Promotion Statistics`, '',
      `Counting only deals the firms published with a date on them: ${stats.total} dated deals across ${rows.length} tracked firms in the last two months, running from ${stats.first} to ${stats.last}. Updated ${monthYearUTC(now)}.`, '',
      `### Monthly Prop Firm Deal Statistics`, '',
      `The last two calendar months. Months with no recorded deal show 0 ${EN_DASH} the log does not hide quiet stretches.`, '',
      `| Month | Deals | Firms active |`,
      `|-------|-------|--------------|`);
    for (const m of stats.months) md.push(`| ${monthLabel(m.ym)} | ${m.deals} | ${m.firms} |`);
    md.push('', `### Most Active Prop Firms by Promotional Activity`, '',
      `Track promotional activity across ${rows.length} proprietary trading firms using ${stats.total} dated deal records from ${monthSpanLabel(stats.months)}. Explore monthly promotion counts, compare firm activity, and identify which proprietary trading firms have published the most deals recently.`, '',
      `| Firm | Deals (2 mo) | Best offer | Last deal | Code |`,
      `|------|---------------|------------|-----------|------|`);
    for (const f of stats.topFirms) md.push(`| [${f.firm}](${site.origin}/firms/${f.slug}/) | ${f.count} | ${f.best === null ? EN_DASH : `${f.best}%`} | ${f.last} | ${f.code} |`);
  }
  md.push('', '## About this site and how codes are checked', '',
    `${site.siteName} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022.`, '',
    `Every listed code is maintained as a standing discount code associated with its respective prop firm, rather than a code limited to a specific promotional campaign.`, '',
    `When a firm publishes a new deal featuring a discount code, the team confirms whether the standing code still applies and records the deal with its original publication date.`, '',
    `The date displayed in the deal history represents the firm's publication date, not the date the standing code was independently re-tested. Listed codes have no published expiry date, but availability and terms may change.`, '',
    `Corrections are welcome at ${site.email}. Verified corrections are reflected in the next hourly database rebuild.`, '',
    `Full dataset and methodology notes: ${site.origin}/dataset.json and ${site.origin}/llms.txt.`);
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
