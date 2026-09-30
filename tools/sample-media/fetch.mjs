#!/usr/bin/env node
/**
 * Fetches a sample quiz's media from Wikimedia Commons and prepares them the way
 * the editor would: pictures in WebP, sounds in MP3 with their waveform, duration
 * and loudness. Reads `<sample>/sources.json`, writes `<sample>/media/*`, and puts
 * each file's alt text and credit (plus a sound's measures) into the `media` map
 * of `<sample>/quiz.json`. Run through ./run.sh (Docker, ffmpeg inside).
 *
 * sources.json: { "media": [ {
 *   "file": "taipei.webp",            // the name under media/
 *   "commons": "File:….jpg",          // the Commons page
 *   "alt": "…",                       // in the quiz's language
 *   "width": 1600,                    // pictures: the largest side kept (default 1280)
 *   "square": true,                   // pictures: cropped to a centred square
 *   "start": 0, "duration": 25,       // sounds: the excerpt kept, in seconds
 *   "author": "…"                    // when Commons' author field is not the author
 * } ] }
 *
 * Only licences a CC BY 4.0 quiz can carry are taken: public domain, CC0 and
 * CC BY (no SA, NC or ND). A file already there is kept; `--force` fetches again.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const PEAKS = 200;
const UA = 'QuizDock-sample-media/1.0 (https://github.com/quizdock/quiz-dock)';
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));
const root = '/work';

const allowed = (license) =>
  /^(cc0|public domain|pd\b|pd-|cc by \d)/i.test(license) && !/\b(sa|nc|nd)\b/i.test(license);
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

async function commons(title, thumbWidth) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: title,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiextmetadatafilter: 'LicenseShortName|Artist|Credit',
    ...(thumbWidth ? { iiurlwidth: String(thumbWidth) } : {}),
  }).toString();
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const page = Object.values((await res.json()).query.pages)[0];
  if (!page.imageinfo) throw new Error(`${title}: not found on Commons`);
  const info = page.imageinfo[0];
  const meta = info.extmetadata ?? {};
  return {
    url: info.thumburl ?? info.url,
    original: info.url,
    page: info.descriptionurl,
    width: info.width,
    height: info.height,
    license: plain(meta.LicenseShortName?.value ?? ''),
    author: plain(meta.Artist?.value ?? meta.Credit?.value ?? 'Unknown author'),
  };
}

async function download(url, to) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  writeFileSync(to, Buffer.from(await res.arrayBuffer()));
}

const ffmpeg = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);

/** What the editor measures on a sound (lib/audio-analysis.ts), from its decoded samples. */
function analyse(file) {
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-f', 'f32le', '-'], {
    maxBuffer: 1 << 30,
  });
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  const peaks = new Array(PEAKS).fill(0);
  let top = 0;
  for (let i = 0; i < PEAKS; i++) {
    const from = Math.floor((i * samples.length) / PEAKS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / PEAKS));
    for (let j = from; j < to && j < samples.length; j++) {
      const v = Math.abs(samples[j]);
      if (v > peaks[i]) peaks[i] = v;
    }
    if (peaks[i] > top) top = peaks[i];
  }
  const probe = execFileSync(
    'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file],
    { encoding: 'utf8' },
  );
  const r128 = execFileSync(
    'sh',
    ['-c', `ffmpeg -nostats -i "${file}" -af ebur128=peak=sample -f null - 2>&1`],
    { encoding: 'utf8' },
  );
  const lufs = Number(
    r128
      .match(/I:\s+(-?[\d.]+) LUFS/g)
      ?.pop()
      ?.match(/-?[\d.]+/)?.[0],
  );
  const peakDb = Number(
    r128
      .match(/Peak:\s+(-?[\d.]+) dBFS/g)
      ?.pop()
      ?.match(/-?[\d.]+/)?.[0],
  );
  return {
    durationMs: Math.max(1, Math.round(Number(probe) * 1000)),
    peaks: top > 0 ? peaks.map((p) => Math.round((p / top) * 1000) / 1000) : peaks,
    ...(Number.isFinite(lufs) && lufs > -70 ? { loudnessLufs: lufs } : {}),
    ...(Number.isFinite(peakDb) ? { peakDbfs: peakDb } : {}),
    origin: 'upload',
  };
}

async function prepare(dir, entry, tmp) {
  const out = join(dir, 'media', entry.file);
  const sound = entry.file.endsWith('.mp3');
  const width = entry.width ?? 1280;
  // 1920: a thumbnail width Commons keeps ready (other widths are rendered on demand, and throttled).
  const info = await commons(entry.commons, sound ? undefined : 1920);
  if (!allowed(info.license))
    throw new Error(`${entry.commons}: licence "${info.license}" refused`);
  if (force || !existsSync(out)) {
    const source = join(tmp, `source-${entry.file}`);
    await download(info.url, source);
    if (sound) {
      const start = entry.start ?? 0;
      const duration = entry.duration ?? 30;
      ffmpeg(
        '-ss',
        String(start),
        '-t',
        String(duration),
        '-i',
        source,
        '-af',
        `afade=t=out:st=${Math.max(0, duration - 2)}:d=2`,
        '-ac',
        '2',
        '-ar',
        '44100',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        out,
      );
    } else {
      const crop = entry.square ? 'crop=min(iw\\,ih):min(iw\\,ih),' : '';
      ffmpeg(
        '-i',
        source,
        '-vf',
        `${crop}scale='min(${width},iw)':'min(${width},ih)':force_original_aspect_ratio=decrease`,
        '-c:v',
        'libwebp',
        '-quality',
        '70',
        '-frames:v',
        '1',
        out,
      );
    }
  }
  // Commons' author field is sometimes a composer or a URL: sources.json may name the author.
  const author = entry.author ?? info.author;
  const credit = `${author} · ${info.license} · Wikimedia Commons`.slice(0, 300);
  return {
    source: { ...entry, license: info.license, author, page: info.page },
    meta: {
      name: entry.file,
      ...(entry.alt ? { alt: entry.alt } : {}),
      credit,
      ...(sound ? analyse(out) : {}),
    },
  };
}

for (const name of readdirSync(root).sort()) {
  const dir = join(root, name);
  if (!existsSync(join(dir, 'sources.json')) || (only.length && !only.includes(name))) continue;
  const sources = JSON.parse(readFileSync(join(dir, 'sources.json'), 'utf8'));
  const quizFile = join(dir, 'quiz.json');
  const quiz = JSON.parse(readFileSync(quizFile, 'utf8'));
  const tmp = join('/tmp', name);
  mkdirSync(join(dir, 'media'), { recursive: true });
  mkdirSync(tmp, { recursive: true });
  const media = {};
  const resolved = [];
  for (const entry of sources.media) {
    const { source, meta } = await prepare(dir, entry, tmp);
    media[`media/${entry.file}`] = meta;
    resolved.push(source);
    console.log(`${name}: ${entry.file} — ${source.license}, ${source.author}`);
  }
  quiz.media = media;
  writeFileSync(quizFile, `${JSON.stringify(quiz, null, 2)}\n`);
  writeFileSync(join(dir, 'sources.json'), `${JSON.stringify({ media: resolved }, null, 2)}\n`);
}
