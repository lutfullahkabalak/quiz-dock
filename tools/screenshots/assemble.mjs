#!/usr/bin/env node
/**
 * After shoot.mjs: the phones side by side on a light band, and the demo GIF from
 * the projection's frames. Reads /out/.work/assemble.json, writes into /out, then
 * removes .work. Runs where ffmpeg is (run.sh: the sample-media image).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';

const OUT = process.env.OUT ?? '/out';
const WORK = `${OUT}/.work`;
const ffmpeg = (...args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);
const { composites, frames } = JSON.parse(readFileSync(`${WORK}/assemble.json`, 'utf8'));

for (const { name, parts } of composites) {
  const pads = parts.map((_, i) => `[${i}:v]pad=iw+48:ih+48:24:24:color=0xf1f5f9[p${i}]`);
  const stack = `${parts.map((_, i) => `[p${i}]`).join('')}hstack=inputs=${parts.length}`;
  ffmpeg(
    ...parts.flatMap((p) => ['-i', p]),
    '-filter_complex',
    `${pads.join(';')};${stack}`,
    `${OUT}/${name}.png`,
  );
  console.log('composite', name);
}

if (frames > 0) {
  ffmpeg(
    '-framerate',
    '2.5',
    '-i',
    `${WORK}/frames/%04d.png`,
    '-vf',
    'scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    '-loop',
    '0',
    `${OUT}/demo.gif`,
  );
  console.log('gif', frames, 'frames');
}

rmSync(WORK, { recursive: true, force: true });
