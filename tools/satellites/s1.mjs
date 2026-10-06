// Satellite 1 — verification log angle.
import {
  esc, EN_DASH, monthYearUTC, offerShape, titleFor, firmJsonLd, layout,
  DISCLOSURE, robotsTxt, llmsTxt, sitemapXml, aiSitemapXml, apiCatalog,
  skillMd, webmcpJs, csvOf, headersFile, assertClean, parseFirmMirror,
  publisherOrg, webManifest,
} from './lib.mjs';

export const site = {
  id: 's1',
  workerName: 'pfd-codecheck',
  domainPlaceholder: 'propfirmcodecheck.example',
  siteName: 'Prop Firm Code Check',
  shortName: 'CodeCheck',
  icons: true,
  tagline: EN_DASH + ' standing discount code verification log',
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
  rows.push(['Apply', `<a rel="nofollow" href="${esc(firm.activation_link)}">Activate the ${esc(firm.prop_firm)} code</a>`]);
  rows.push(['Data source', `<a href="${esc(firm.archive_url)}">PropFirmDiscount firm page</a>`]);
  return `<table>\n<tbody>\n${rows.map(([k, v]) => `<tr><th scope="row">${k}</th><td>${v}</td></tr>`).join('\n')}\n</tbody>\n</table>`;
}

function dealBridge(firm, mirror) {
  return {
    standing: `This promotion runs on the standing code above ${EN_DASH} <code>${esc(firm.code)}</code> ${EN_DASH} the same code the firm shows for this campaign, still valid any time.`,
    own: `This is a limited-time campaign with its own code and terms; the standing code <code>${esc(firm.code)}</code> above is the one that works any time.`,
    unknown: `This is the firm's newest promotion; the standing code <code>${esc(firm.code)}</code> above is the one that works any time.`,
  }[mirror.dealCodeRelation];
}

function currentDealSection(firm, mirror) {
  const d = mirror.latestDeal;
  if (!d) return '';
  const o = offerShape(d.offer);
  const rows = [
    ['Published', `<time datetime="${esc(d.published)}">${esc(d.published)}</time>`],
  ];
  if (d.offer) rows.push(['Offer', esc(o.titlePart || d.offer)]);
  if (d.scope) rows.push(['Scope', esc(d.scope)]);
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
<p>Each entry is a dated deal that carried a code ${EN_DASH} the check trail behind the standing rate above. Newest first.</p>
<ol class="log">
${items}
</ol>`;
}

function faqSection(firm, mirror) {
  if (!mirror.faq.length) return '';
  const blocks = mirror.faq.slice(0, 4).map((f) => `<h3>${esc(f.q)}</h3>\n<p>${esc(f.a)}</p>`).join('\n');
  const heading = mirror.latestDeal ? `${mirror.latestDeal.title} FAQ` : `${firm.prop_firm} code FAQ`;
  const note = `<p>These questions cover the promotion described above, not the standing code ${EN_DASH} the standing code keeps working after the campaign ends.</p>\n`;
  return `<h2 id="faq">${esc(heading)}</h2>\n${note}${blocks}`;
}

export function firmPage(site, firm, mirror, now) {
  const title = titleFor(firm, now);
  const o = offerShape(firm.discount);
  const ldDeal = mirror.latestDeal;
  const promotion = ldDeal ? ` Its newest promotion, ${ldDeal.title}${ldDeal.published ? ` (published ${ldDeal.published})` : ''}, is detailed below.` : '';
  const desc = `${firm.prop_firm} discount code ${firm.code} gives ${o.sentence || 'a discount'} ${EN_DASH} verified standing exclusive code, checked ${monthYearUTC(now)} by the PropFirmDiscount team. Last deal ${firm.last_deal_published || 'n/a'}.`.slice(0, 300);
  const path = `/firms/${firm.slug}`;
  const ld = firmJsonLd(site, firm, title, desc, now);
  const body = `<nav class="crumb"><a href="/">All firms</a> ${EN_DASH} ${esc(firm.prop_firm)}</nav>
<h1>${esc(firm.prop_firm)} Discount Code</h1>
<p class="answer">The verified standing exclusive code for ${esc(firm.prop_firm)} is <code class="chip" data-code="${esc(firm.code)}">${esc(firm.code)}</code>${o.sentence ? ` ${EN_DASH} ${esc(o.sentence)}` : ''}, works any time. Checked by our team when ${esc(firm.prop_firm)}'s newest deal was published${firm.last_deal_published ? ` (${esc(firm.last_deal_published)})` : ''}.${promotion}</p>
${factsTable(firm, mirror)}
${logSection(mirror)}
${currentDealSection(firm, mirror)}
${faqSection(firm, mirror)}`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}${path}/`, ld, body, path }) };
}

export function firmTwins(site, firm, mirror, now) {
  const o = offerShape(firm.discount);
  const md = [`# ${firm.prop_firm} Discount Code`, '',
    `The verified standing exclusive code for ${firm.prop_firm} is **${firm.code}**${o.sentence ? ` ${EN_DASH} ${o.sentence}` : ''}, works any time. Checked ${monthYearUTC(now)} by the PropFirmDiscount team.`, ''];
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
    md.push(`- Deal page: ${ldDeal.dealUrl}`, '');
    md.push({
      standing: `This promotion runs on the standing code ${firm.code} above — the same code the firm shows for this campaign, still valid any time.`,
      own: `This is a limited-time campaign with its own code and terms; the standing code ${firm.code} above is the one that works any time.`,
      unknown: `This is the firm's newest promotion; the standing code ${firm.code} above is the one that works any time.`,
    }[mirror.dealCodeRelation], '');
  }
  if (mirror.faq.length) {
    md.push(`## ${ldDeal ? `${ldDeal.title} FAQ` : `${firm.prop_firm} code FAQ`}`, '');
    md.push(`These questions cover the promotion described above, not the standing code — the standing code keeps working after the campaign ends.`, '');
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
    current_deal: ldDeal ? { title: ldDeal.title, published: ldDeal.published, offer: ldDeal.offer, scope: ldDeal.scope, deal_url: ldDeal.dealUrl, code_relation: mirror.dealCodeRelation } : null,
    changelog: mirror.dealHistory,
  };
  return { md: md.join('\n'), json: JSON.stringify(json, null, 2) };
}

export function hubPage(site, rows, now) {
  const sorted = [...rows].sort((a, b) => String(b.last_deal_published || '').localeCompare(String(a.last_deal_published || '')));
  const title = `Prop Firm Discount Code Checks ${EN_DASH} ${monthYearUTC(now)}`;
  const desc = `Verification log of ${rows.length} verified standing exclusive prop firm discount codes, newest checks first. Updated ${monthYearUTC(now)}.`;
  const rowOf = (r) => `<tr>
<td><a href="/firms/${r.slug}/">${esc(r.prop_firm)}</a></td>
<td><code>${esc(r.code)}</code></td>
<td>${esc(offerShape(r.discount).titlePart || r.discount || EN_DASH)}</td>
<td>${esc(monthYearUTC(now))}</td>
<td>${r.last_deal_published ? `<time datetime="${esc(r.last_deal_published)}">${esc(r.last_deal_published)}</time>` : EN_DASH}</td>
</tr>`;
  const table = `<table class="checks">
<thead><tr><th scope="col">Firm</th><th scope="col">Code</th><th scope="col">Discount</th><th scope="col">Checked</th><th scope="col">Last deal</th></tr></thead>
<tbody>
${sorted.map(rowOf).join('\n')}
</tbody>
</table>`;
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
<p class="answer">This log tracks ${rows.length} verified standing exclusive discount codes for proprietary trading firms, newest check first. Every entry links to a firm page with the code, its validity window and the dated deal trail behind it.</p>
<h2 id="log">Checks, newest first</h2>
${table}
<h2 id="method">About this site and how codes are checked</h2>
<p>${esc(site.siteName)} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022. Every code listed here is a standing exclusive code the team maintains with each firm; the code works any time, not only during a campaign window.</p>
<p>What a check entry means: when a firm publishes a new coded deal, the team confirms the standing code still applies and records the deal here with its publish date. The date you see is the deal's publish date ${EN_DASH} it is not a claim that the code was re-tested that day. Validity windows follow the current calendar year and roll over every January 1.</p>
<p>Corrections welcome: email <a href="mailto:${esc(site.email)}">${esc(site.email)}</a> and the entry is updated in the next hourly rebuild. Full dataset and methodology notes: <a href="/dataset.json">dataset.json</a>, <a href="/llms.txt">llms.txt</a>.</p>`;
  return { title, desc, html: layout(site, { title, desc, canonical: `${site.origin}/`, ld, body, path: null, altMarkdown: '/md' }) };
}

// Machine twin of the hub. Same rows as the page, as a markdown table so an
// agent can read the whole log in one fetch.
export function hubMarkdown(site, rows, now) {
  const sorted = [...rows].sort((a, b) => String(b.last_deal_published || '').localeCompare(String(a.last_deal_published || '')));
  const md = [`# Prop Firm Discount Code Checks`, '',
    `This log tracks ${rows.length} verified standing exclusive discount codes for proprietary trading firms, newest check first. Every entry links to a firm page with the code, its validity window and the dated deal trail behind it.`, '',
    `## Checks, newest first`, '',
    `| Firm | Code | Discount | Checked | Last deal |`,
    `|------|------|----------|---------|-----------|`];
  for (const r of sorted) {
    md.push(`| [${r.prop_firm}](${site.origin}/firms/${r.slug}/) | ${r.code} | ${offerShape(r.discount).titlePart || r.discount || EN_DASH} | ${monthYearUTC(now)} | ${r.last_deal_published || EN_DASH} |`);
  }
  md.push('', '## About this site and how codes are checked', '',
    `${site.siteName} is operated by the PropFirmDiscount team, which has tracked proprietary trading firm promotions since 2022. Every code listed here is a standing exclusive code the team maintains with each firm; the code works any time, not only during a campaign window.`, '',
    `What a check entry means: when a firm publishes a new coded deal, the team confirms the standing code still applies and records the deal here with its publish date. The date you see is the deal's publish date ${EN_DASH} it is not a claim that the code was re-tested that day. Validity windows follow the current calendar year and roll over every January 1.`, '',
    `Corrections welcome: ${site.email}. Full dataset: ${site.origin}/dataset.json. Methodology notes: ${site.origin}/llms.txt.`);
  return md.join('\n') + '\n';
}

export function buildSite(siteIn, rows, mirrors, now, out) {
  const site = withEmail(siteIn);
  const files = {};
  const htmlPaths = ['/'];
  for (const firm of rows) {
    const mirror = mirrors[firm.slug] || { lead: '', summary: '', bullets: {}, dealHistory: [], faq: [] };
    const page = firmPage(site, firm, mirror, now);
    const twins = firmTwins(site, firm, mirror, now);
    files[`firms/${firm.slug}/index.html`] = page.html;
    files[`firms/${firm.slug}.md`] = twins.md;
    files[`firms/${firm.slug}.json`] = twins.json;
    htmlPaths.push(`/firms/${firm.slug}/`);
  }
  const hub = hubPage(site, rows, now);
  files['index.html'] = hub.html;
  files['md'] = hubMarkdown(site, rows, now);
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
