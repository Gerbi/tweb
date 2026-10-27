// Stages a production build as a Cloudflare Worker with static assets and, with --deploy,
// uploads it with wrangler.
//
//   node scripts/cloudflare-deploy.mjs                   stage public/ into tmp/cloudflare
//   node scripts/cloudflare-deploy.mjs --from=dist       stage a fresh `vp build` instead
//   node scripts/cloudflare-deploy.mjs --deploy [--name=tgweb]
//
// Source maps stay behind: nobody downloads them, and they are 40+ MB of every upload.
// The app is static and talks to Telegram from the browser, so the Worker is assets only;
// Cloudflare compresses with Brotli on its own. A missing file is a 404, never index.html:
// the app routes by hash and query, and a chunk an old tab still asks for must fail as one. wrangler gets its config from tmp/cloudflare:
// left to find none in the repo, it "sets up" the project itself (adds packages, edits
// vite.config.ts). Log in once with `wrangler login`, or set CLOUDFLARE_API_TOKEN.
import {spawnSync} from 'node:child_process';
import {cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));

const root = resolve(import.meta.dirname, '..');
const publicDir = join(root, 'public');
const from = join(root, args.from || 'public');
const stage = join(root, 'tmp', 'cloudflare');
const assets = join(stage, 'assets');

rmSync(stage, {recursive: true, force: true});
mkdirSync(stage, {recursive: true});
// dist/ is the bundle alone: images, fonts and the other static files live in public/,
// and a fresh bundle goes on top of them, as build.js lays it out.
if(from !== publicDir) {
  const keepAsset = createRequire(import.meta.url)('../keepAsset');
  for(const entry of readdirSync(publicDir, {withFileTypes: true})) {
    if(entry.isDirectory() || keepAsset(entry.name)) {
      cpSync(join(publicDir, entry.name), join(assets, entry.name), {recursive: true});
    }
  }
}
cpSync(from, assets, {recursive: true, filter: (path) => !path.endsWith('.map')});

let files = 0, bytes = 0, largest = 0;
const walk = (dir) => {
  for(const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name);
    if(entry.isDirectory()) {
      walk(path);
      continue;
    }

    const size = statSync(path).size;
    ++files;
    bytes += size;
    largest = Math.max(largest, size);
  }
};
walk(assets);

console.log(`staged ${files} files, ${(bytes / 1048576).toFixed(1)} MB, largest ${(largest / 1048576).toFixed(1)} MB → ${assets}`);
if(files > 20000 || largest > 25 * 1048576) {
  throw new Error('over the Cloudflare free plan limits: 20000 files, 25 MiB per file');
}

const name = args.name || process.env.CF_WORKER_NAME || 'tgweb';
writeFileSync(join(stage, 'wrangler.jsonc'), JSON.stringify({
  name,
  compatibility_date: '2026-10-01',
  assets: {
    directory: './assets'
  }
}, null, 2) + '\n');

if(args.deploy) {
  // one command line: pnpm is a .cmd on Windows, which only a shell runs
  const {status} = spawnSync('pnpm dlx wrangler@4 deploy --config wrangler.jsonc', {
    stdio: 'inherit',
    shell: true,
    cwd: stage
  });
  process.exitCode = status ?? 1;
}
