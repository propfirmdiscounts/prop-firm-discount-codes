// Public MCP server for propfirmdiscount.com — Cloudflare Worker.
//
// Streamable HTTP, stateless: one POST /mcp carries a single JSON-RPC message
// and gets a single JSON response back (no SSE session to keep). Every tool is
// read-only and returns only PUBLIC data: the codes dataset, the 2-month deals
// snapshot, firm markdown mirrors, and the events mirror. Campaign code values
// never exist in any of these sources, so none can be returned here.
//
// Data is fetched from the public origin and cached with the Cache API
// (10 min), so a busy agent never turns into load on the origin.

const ORIGIN = 'https://propfirmdiscount.com';
const EVENTS_ORIGIN = 'https://propfirmevents.com';
const CACHE_TTL = 600;
const MARKDOWN_CAP = 20000;
const PROTOCOL_VERSION = '2025-06-18';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

// ── cached fetch ────────────────────────────────────────────────
async function cachedJson(url) {
  const cache = caches.default;
  const key = new Request(url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return await hit.json();
  const res = await fetch(url, { cf: { cacheTtl: CACHE_TTL, cacheEverything: true } });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const body = await res.text();
  const stored = new Response(body, {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `max-age=${CACHE_TTL}` },
  });
  await cache.put(key, stored.clone());
  return JSON.parse(body);
}

async function cachedText(url, cap = 0) {
  const cache = caches.default;
  const key = new Request(url, { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    const text = await hit.text();
    return cap ? clip(text, cap) : text;
  }
  const res = await fetch(url, {
    headers: { accept: 'text/markdown' },
    cf: { cacheTtl: CACHE_TTL, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
  const body = await res.text();
  await cache.put(key, new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': `max-age=${CACHE_TTL}` },
  }).clone());
  return cap ? clip(body, cap) : body;
}

function clip(text, cap) {
  if (text.length <= cap) return text;
  return `${text.slice(0, cap)}\n\n…[truncated at ${cap} characters]`;
}

// ── data accessors ──────────────────────────────────────────────
async function codesDataset() {
  // The canonical API path, NOT /datasets/prop-firm-codes.json: the edge
  // currently serves that static file as brotli without a content-encoding
  // header to clients that send no Accept-Encoding, which decodes to garbage.
  // The API path is clean for every client and is CF-cached upstream.
  const raw = await cachedJson(`${ORIGIN}/api/prop-firm-codes/`);
  return Array.isArray(raw) ? raw : (raw.data || []);
}

// Deals come straight from the coupon parent-category markdown mirror
// (term 205), which prod already renders as a rolling 2-month table that
// unions the campaign-coded and code-free children — so the window and the
// per-row code_state are the site's own, not a second copy to keep in sync.
// Each row is joined to the codes dataset for the firm's standing code.
async function dealsDataset() {
  const [md, codes] = await Promise.all([
    cachedText(`${ORIGIN}/category/prop-firm-coupon/md`),
    codesDataset(),
  ]);
  const standing = standingIndex(codes);
  const deals = parseDealTable(md).map((r) => {
    const s = standing.bySlug.get(firmSlugFromDealUrl(r.url))
      || standing.byName.get(canonicalFirm(r.firm)) || null;
    return {
      published: r.published,
      firm: r.firm,
      deal: r.deal,
      url: r.url,
      discount: r.discount,
      code_state: r.codeState,
      code: r.codeState === 'standing' ? r.codeValue : null,
      code_label: r.codeState === 'standing' ? null : r.codeValue,
      get_code_url: r.url,
      standing_code: s ? s.code : null,
      standing_discount: s ? s.discount : null,
      activation_link: s ? s.activation_link : null,
      standing_valid_until: s ? s.valid_until : null,
    };
  });
  return { window_start: windowStart(), count: deals.length, deals };
}

// Parse the coupon mirror's markdown table (| Published | Firm | Deal |
// Discount | Code | Link |). The Code cell is the firm's standing code (already
// public) or one of two public-safe labels — a campaign code value is never
// written into a mirror, so it can never appear here.
function parseDealTable(md) {
  const rows = [];
  let inTable = false;
  for (const raw of String(md).split('\n')) {
    if (/^\|\s*Published\s*\|\s*Firm\s*\|/.test(raw)) { inTable = true; continue; }
    if (!inTable) continue;
    const line = raw.trim();
    if (/^\|[\s|:-]+$/.test(line)) continue;
    if (!line.startsWith('|')) { inTable = false; continue; }
    const cells = line.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
    if (cells.length < 6) continue;
    const [published, firm, dealCell, discount, code] = cells;
    const lm = /^\[(.+?)\]\((\S+?)\)$/.exec(dealCell);
    const codeTrim = code.trim();
    rows.push({
      published,
      firm: firm.trim(),
      deal: lm ? lm[1] : dealCell,
      url: lm ? lm[2] : cells[5].trim(),
      discount: discount.trim() || null,
      codeState: codeTrim === 'Campaign Code Required' ? 'campaign'
        : codeTrim === 'No Code Required' ? 'none' : 'standing',
      codeValue: codeTrim,
    });
  }
  return rows.sort((a, b) => b.published.localeCompare(a.published));
}

// Codes indexed by firm slug (from archive_url) and by canonical firm name.
function standingIndex(codes) {
  const bySlug = new Map();
  const byName = new Map();
  for (const r of codes) {
    const entry = {
      firm: r.prop_firm, code: r.code, discount: r.discount,
      valid_until: r.valid_until || null, activation_link: r.activation_link || null,
    };
    const slug = firmSlugFromArchive(r.archive_url);
    if (slug) bySlug.set(slug, entry);
    byName.set(canonicalFirm(r.prop_firm), entry);
  }
  return { bySlug, byName };
}

// First day of the previous calendar month, UTC — the same 2-month window prod
// uses (pfd_md_window_start() in pfd-md-mirrors.php). Reported in tool output
// so an agent can state the window; the mirror is already filtered to it.
function windowStart() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

async function eventsDataset() {
  return await cachedJson(`${EVENTS_ORIGIN}/dataset.json`);
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const pctOf = (s) => {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(String(s || ''));
  return m ? parseFloat(m[1]) : null;
};

const canonicalFirm = (f) => String(f || '').replace(/\s*\([^)]*\)\s*$/, '').trim();

// A public codes row — never carries any internal field.
function publicCodeRow(r) {
  return {
    firm: r.prop_firm,
    code: r.code,
    discount: r.discount,
    valid_from: r.valid_from || null,
    valid_until: r.valid_until || null,
    last_deal_published: r.last_deal_published || null,
    activation_link: r.activation_link || null,
    archive_url: r.archive_url || null,
    trustpilot_score: r.trustpilot_score ?? null,
    trustpilot_reviews: r.trustpilot_reviews ?? null,
  };
}

const todayISO = () => new Date().toISOString().slice(0, 10);

// ── tool implementations ────────────────────────────────────────
async function tool_list_codes(args = {}) {
  const rows = await codesDataset();
  const firm = norm(args.firm);
  const activeOnly = args.active_only !== false;
  const minPct = args.min_discount_pct != null ? Number(args.min_discount_pct) : null;
  const limit = clampInt(args.limit, 50, 1, 200);
  const offset = clampInt(args.offset, 0, 0, 10000);
  const today = todayISO();

  let out = rows.map(publicCodeRow);
  if (firm) out = out.filter((r) => norm(r.firm).includes(firm));
  if (activeOnly) out = out.filter((r) => !r.valid_until || r.valid_until >= today);
  if (minPct != null && !Number.isNaN(minPct)) out = out.filter((r) => (pctOf(r.discount) ?? -1) >= minPct);

  const total = out.length;
  const page = out.slice(offset, offset + limit);
  return {
    total,
    count: page.length,
    note: 'Every row is a verified standing exclusive code; these work any time. '
      + 'valid_from/valid_until are a procedural calendar-year label, not an expiry.',
    codes: page,
  };
}

async function tool_get_firm(args = {}) {
  const q = norm(args.firm || args.name || '');
  if (!q) throw new McpError('invalid_params', 'provide "firm"');
  const rows = await codesDataset();
  let hit = rows.find((r) => norm(r.prop_firm) === q)
    || rows.find((r) => norm(canonicalFirm(r.prop_firm)) === q)
    || rows.find((r) => norm(r.prop_firm).includes(q));
  if (!hit) {
    // Fall back to the deals snapshot: a firm with deals but no standing code.
    const ds = await dealsDataset();
    const d = (ds.deals || []).find((r) => norm(r.firm).includes(q));
    if (d) {
      return {
        found: true,
        firm: d.firm,
        standing_code: null,
        note: 'This firm has no verified standing exclusive code on record. '
          + 'Deals below may still carry their own code on the deal page.',
        deals: (ds.deals || []).filter((r) => norm(r.firm).includes(q)).slice(0, 10),
      };
    }
    return { found: false, firm: args.firm, note: 'No firm matched.' };
  }
  const slug = firmSlugFromArchive(hit.archive_url);
  return {
    found: true,
    ...publicCodeRow(hit),
    markdown_url: slug ? `${ORIGIN}/prop-firm/${slug}/md` : null,
    note: 'Verified standing exclusive code; works any time — the validity window '
      + 'is a procedural calendar-year label, not an expiry.',
  };
}

async function tool_get_firm_markdown(args = {}) {
  let slug = String(args.slug || '').trim();
  if (!slug && args.firm) {
    const rows = await codesDataset();
    const q = norm(args.firm);
    const hit = rows.find((r) => norm(r.prop_firm).includes(q));
    slug = hit ? firmSlugFromArchive(hit.archive_url) : '';
  }
  if (!slug) throw new McpError('invalid_params', 'provide "slug" or "firm"');
  slug = slug.replace(/[^a-z0-9-]/g, '');
  const url = `${ORIGIN}/prop-firm/${slug}/md`;
  const md = await cachedText(url, MARKDOWN_CAP);
  return { slug, url, markdown: md };
}

async function tool_latest_deals(args = {}) {
  const ds = await dealsDataset();
  const limit = clampInt(args.limit, 20, 1, 200);
  const deals = (ds.deals || []).slice(0, limit);
  return {
    window_start: ds.window_start,
    total_in_window: ds.count,
    count: deals.length,
    note: 'Rolling 2-month window. code holds a value only when code_state is '
      + '"standing"; for "campaign"/"none" open get_code_url to see the code on '
      + 'the deal page. standing_code (the firm\'s verified standing exclusive '
      + 'code, works any time) is present whenever the firm has one.',
    deals,
  };
}

async function tool_search_deals(args = {}) {
  const ds = await dealsDataset();
  const firm = norm(args.firm);
  const q = norm(args.query || args.q || '');
  const state = args.code_state ? String(args.code_state) : '';
  const minPct = args.min_discount_pct != null ? Number(args.min_discount_pct) : null;
  const limit = clampInt(args.limit, 20, 1, 200);

  let out = ds.deals || [];
  if (firm) out = out.filter((r) => norm(r.firm).includes(firm));
  if (q) out = out.filter((r) => norm(`${r.deal} ${r.firm} ${r.discount}`).includes(q));
  if (state) out = out.filter((r) => r.code_state === state);
  if (minPct != null && !Number.isNaN(minPct)) out = out.filter((r) => (pctOf(r.discount) ?? -1) >= minPct);

  return {
    window_start: ds.window_start,
    total: out.length,
    count: Math.min(out.length, limit),
    note: 'Deals in the rolling 2-month window. Campaign/code-free deals still list '
      + 'the full deal info; their code is on the deal page (get_code_url).',
    deals: out.slice(0, limit),
  };
}

async function tool_list_events() {
  const ds = await eventsDataset();
  const cats = (ds.categories || []).map((c) => ({
    slug: c.slug, name: c.name, path: c.path, deals: c.deals, last_published: c.last_published,
  }));
  const tags = (ds.tags || []).map((t) => ({
    slug: t.slug, name: t.name, path: t.path, deals: t.deals, last_published: t.last_published,
  }));
  return {
    generated: ds.generated,
    note: 'Full seasonal deal archive by event/holiday (not limited to the 2-month '
      + 'window). Each deal row states how its code redeems.',
    categories: cats,
    tags,
    total_deals: (ds.deals || []).length,
  };
}

async function tool_get_event(args = {}) {
  const slug = String(args.slug || '').trim();
  if (!slug) throw new McpError('invalid_params', 'provide "slug"');
  const ds = await eventsDataset();
  const all = [...(ds.categories || []), ...(ds.tags || [])];
  const ev = all.find((e) => e.slug === slug);
  if (!ev) return { found: false, slug, note: 'No event with that slug.' };
  const deals = (ds.deals || []).filter((d) => d.source === slug);
  return {
    found: true,
    slug,
    name: ev.name,
    path: ev.path,
    count: deals.length,
    markdown_url: `${EVENTS_ORIGIN}${ev.path}md`,
    note: 'Full seasonal archive for this event (all recorded years, newest first).',
    deals,
  };
}

async function tool_dataset_meta() {
  const [codes, deals] = await Promise.all([codesDataset(), dealsDataset()]);
  return {
    codes: { count: codes.length, source: `${ORIGIN}/api/prop-firm-codes/` },
    deals: {
      count: deals.count,
      window_start: deals.window_start,
      source: `${ORIGIN}/category/prop-firm-coupon/md`,
    },
    note: 'Deals are the rolling 2-month window the site itself publishes; '
      + 'window_start is the first day of the previous calendar month (UTC).',
  };
}

// ── tool registry ───────────────────────────────────────────────
const TOOLS = [
  {
    name: 'list_codes',
    description: 'List prop firm verified standing exclusive discount codes. Each code '
      + 'works any time (lifetime); the validity window is a procedural calendar-year '
      + 'label, not an expiry. Filter by firm name, active-only, or minimum discount.',
    inputSchema: {
      type: 'object',
      properties: {
        firm: { type: 'string', description: 'Firm name substring (case-insensitive).' },
        active_only: { type: 'boolean', description: 'Only codes valid today (default true).' },
        min_discount_pct: { type: 'number', description: 'Minimum discount percentage.' },
        limit: { type: 'integer', description: 'Max rows (default 50, max 200).' },
        offset: { type: 'integer', description: 'Rows to skip (default 0).' },
      },
    },
  },
  {
    name: 'get_firm',
    description: 'Get one firm by name: its verified standing exclusive code (works any '
      + 'time), discount, activation link and markdown mirror URL. If the firm has no '
      + 'standing code, returns its recent deals instead.',
    inputSchema: {
      type: 'object',
      properties: { firm: { type: 'string', description: 'Firm name (fuzzy match).' } },
      required: ['firm'],
    },
  },
  {
    name: 'get_firm_markdown',
    description: 'Return the markdown mirror of a firm page (facts, current deals, FAQ). '
      + 'Provide a slug or a firm name.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Firm slug, e.g. "funded-hero".' },
        firm: { type: 'string', description: 'Firm name (resolved to a slug).' },
      },
    },
  },
  {
    name: 'latest_deals',
    description: 'Newest cross-firm prop firm deals within the rolling 2-month window. '
      + 'Every row lists the deal and the firm\'s standing_code (a verified standing '
      + 'exclusive code that works any time, present whenever the firm has one). The '
      + 'deal\'s own code is included only when code_state is "standing"; for '
      + '"campaign" or "none" there is no code in the data — tell the user to open '
      + 'get_code_url to see the code on the deal page. Never imply a standing code '
      + 'applies to a campaign\'s discount.',
    inputSchema: {
      type: 'object',
      properties: { limit: { type: 'integer', description: 'Max deals (default 20, max 200).' } },
    },
  },
  {
    name: 'search_deals',
    description: 'Search prop firm deals inside the rolling 2-month window by firm, '
      + 'keyword, code_state or minimum discount. Same code rules as latest_deals: '
      + 'code-free and campaign deals still return full deal info with get_code_url.',
    inputSchema: {
      type: 'object',
      properties: {
        firm: { type: 'string', description: 'Firm name substring.' },
        query: { type: 'string', description: 'Keyword over deal title / firm / discount.' },
        code_state: { type: 'string', enum: ['standing', 'campaign', 'none'], description: 'Filter by how the code redeems.' },
        min_discount_pct: { type: 'number', description: 'Minimum discount percentage.' },
        limit: { type: 'integer', description: 'Max deals (default 20, max 200).' },
      },
    },
  },
  {
    name: 'list_events',
    description: 'List seasonal prop firm events and holidays (Black Friday, Christmas, '
      + '…) with the number of dated deals recorded under each. Full archive, not '
      + 'limited to the 2-month window.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_event',
    description: 'Get every recorded deal for one event/holiday slug (e.g. "black-friday"), '
      + 'each with how its code redeems.',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string', description: 'Event slug, e.g. "black-friday".' } },
      required: ['slug'],
    },
  },
  {
    name: 'get_dataset_meta',
    description: 'Dataset health: row counts, the deals window start and the last generation date.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const HANDLERS = {
  list_codes: tool_list_codes,
  get_firm: tool_get_firm,
  get_firm_markdown: tool_get_firm_markdown,
  latest_deals: tool_latest_deals,
  search_deals: tool_search_deals,
  list_events: tool_list_events,
  get_event: tool_get_event,
  get_dataset_meta: tool_dataset_meta,
};

// ── helpers ─────────────────────────────────────────────────────
function clampInt(v, dflt, lo, hi) {
  const n = Number.parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}

function firmSlugFromArchive(url) {
  const m = /\/prop-firm\/([a-z0-9-]+)\//.exec(String(url || ''));
  return m ? m[1] : '';
}

// Firm slug from a deal URL: /deals/{firm-slug}/{deal-slug}/
function firmSlugFromDealUrl(url) {
  const m = /\/deals\/([a-z0-9-]+)\//.exec(String(url || ''));
  return m ? m[1] : '';
}

class McpError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// ── JSON-RPC ────────────────────────────────────────────────────
function rpcResult(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', id, error: { code, message } }; }

async function handleRpc(msg) {
  const { id, method, params } = msg;
  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: {
        name: 'propfirmdiscount',
        title: 'PropFirmDiscount',
        version: '1.0.0',
      },
      instructions: 'Public prop firm discount data. Codes returned by list_codes / '
        + 'get_firm are verified standing exclusive codes that work any time. Deals '
        + 'cover a rolling 2-month window; a deal\'s own code is present only when '
        + 'code_state is "standing" — otherwise direct the user to the deal page '
        + '(get_code_url) to see its code.',
    });
  }
  if (method === 'notifications/initialized' || method === 'notifications/cancelled') {
    return null; // notifications get no response
  }
  if (method === 'ping') return rpcResult(id, {});
  if (method === 'tools/list') {
    return rpcResult(id, { tools: TOOLS });
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const handler = HANDLERS[name];
    if (!handler) return rpcError(id, -32602, `unknown tool: ${name}`);
    try {
      const data = await handler(params?.arguments || {});
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: data,
        isError: false,
      });
    } catch (e) {
      const code = e instanceof McpError ? -32602 : -32603;
      return rpcResult(id, {
        content: [{ type: 'text', text: `Error: ${e.message}` }],
        isError: true,
      });
    }
  }
  return rpcError(id, -32601, `method not found: ${method}`);
}

// ── HTTP entry ──────────────────────────────────────────────────
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'content-type, mcp-protocol-version',
        },
      });
    }

    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({
        ok: true,
        name: 'propfirmdiscount-mcp',
        endpoint: `${url.origin}/mcp`,
        protocolVersion: PROTOCOL_VERSION,
        tools: TOOLS.map((t) => t.name),
      }, null, 2), { headers: JSON_HEADERS });
    }

    if (url.pathname !== '/mcp') {
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: JSON_HEADERS });
    }

    if (request.method === 'GET') {
      return new Response(JSON.stringify({
        name: 'propfirmdiscount-mcp',
        protocolVersion: PROTOCOL_VERSION,
        transport: 'streamable-http (stateless, JSON responses)',
        usage: 'POST JSON-RPC to this endpoint: initialize, tools/list, tools/call.',
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description })),
      }, null, 2), {
        headers: { ...JSON_HEADERS, 'access-control-allow-origin': '*' },
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: JSON_HEADERS });
    }

    let msg;
    try {
      msg = await request.json();
    } catch {
      return new Response(JSON.stringify(rpcError(null, -32700, 'parse error')), { status: 400, headers: JSON_HEADERS });
    }

    const respond = async (m) => {
      const out = await handleRpc(m);
      return out;
    };

    if (Array.isArray(msg)) {
      const out = (await Promise.all(msg.map(respond))).filter(Boolean);
      if (!out.length) return new Response(null, { status: 202 });
      return new Response(JSON.stringify(out), { headers: { ...JSON_HEADERS, 'access-control-allow-origin': '*' } });
    }

    const out = await respond(msg);
    if (!out) return new Response(null, { status: 202 });
    return new Response(JSON.stringify(out), {
      headers: { ...JSON_HEADERS, 'access-control-allow-origin': '*' },
    });
  },
};