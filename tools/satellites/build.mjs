// Build entrypoint for the PFD satellite network.
// Usage: node tools/satellites/build.mjs [--site s1] [--out dist]
import { mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDataset, parseFirmMirror, loadStandingFirms } from './lib.mjs';
import * as s1 from './s1.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../..');

const args = process.argv.slice(2);
const siteArg = args.includes('--site') ? args[args.indexOf('--site') + 1] : null;
const outRoot = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(here, 'dist');

// Domain binding: set SATELLITE_ORIGIN_S1 etc. in CI secrets/env, or edit the
// placeholder in the site module once the domain is registered. Env wins.
function originFor(site) {
  const env = process.env[`SATELLITE_ORIGIN_${site.id.toUpperCase()}`];
  return env ? env.replace(/\/$/, '') : `https://${site.domainPlaceholder}`;
}

const now = new Date();
const rows = loadDataset(repoRoot);

const mirrors = {};
for (const r of rows) {
  const p = join(repoRoot, 'md', 'prop-firm', `${r.slug}.md`);
  if (existsSync(p)) {
    try {
      mirrors[r.slug] = parseFirmMirror(readFileSync(p, 'utf8'), r.code);
    } catch (e) {
      console.error(`WARN: mirror parse failed for ${r.slug}: ${e.message}`);
    }
  }
}

const sites = [s1].map((m) => ({ ...m.site, origin: originFor(m.site), build: m.buildSite }));
const selected = siteArg ? sites.filter((s) => s.id === siteArg) : sites;
if (!selected.length) {
  console.error(`unknown site: ${siteArg}`);
  process.exit(1);
}

// Firms whose deals render on their standing code, read from the mirror chain
// itself. Anything outside this set shows a campaign code of its own, so its
// code cell must stay blank.
const standingFirms = loadStandingFirms(repoRoot, rows, mirrors);

for (const site of selected) {
  const out = {};
  const n = site.build(site, rows, mirrors, now, out, standingFirms);
  const dir = join(outRoot, site.id);
  for (const [rel, text] of Object.entries(out)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text);
  }
  // Binary assets (favicons etc.) live outside the text builders.
  const assetDir = join(here, 'assets', site.id);
  let assets = 0;
  if (existsSync(assetDir)) {
    for (const f of readdirSync(assetDir)) {
      copyFileSync(join(assetDir, f), join(dir, f));
      assets += 1;
    }
  }
  console.log(`${site.id} (${site.origin}): ${Object.keys(out).length + assets} files (${n} built + ${assets} assets)`);
}
