// Turns the emoji images (public/assets/img/emoji/*.png) into near-lossless WebP and drops the PNGs.
//
//   node scripts/emoji-webp.mjs
//
// Every platform but Apple's draws every emoji from these files (isEmojiNative), so they are
// fetched all the time: near-lossless only nudges pixel values, with no codec artefacts, at
// ~42% less than the PNGs. Run it again after new emoji arrive as PNG (an emoji update upstream):
// only what is still a PNG is converted. getEmojiImageUrl is what asks for .webp.
import {readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import sharp from 'sharp';

const dir = resolve(import.meta.dirname, '..', 'public', 'assets', 'img', 'emoji');
const pngs = readdirSync(dir).filter((name) => name.endsWith('.png'));

let before = 0, after = 0;
for(const name of pngs) {
  const path = join(dir, name);
  const png = readFileSync(path);
  const webp = await sharp(png).webp({nearLossless: true, quality: 60, effort: 6}).toBuffer();
  writeFileSync(path.replace(/\.png$/, '.webp'), webp);
  rmSync(path);
  before += png.length;
  after += webp.length;
}

const total = readdirSync(dir).reduce((sum, name) => sum + statSync(join(dir, name)).size, 0);
const mb = (bytes) => (bytes / 1048576).toFixed(2) + ' MB';
console.log(`converted ${pngs.length} emoji: ${mb(before)} → ${mb(after)}; the folder is ${mb(total)}`);
