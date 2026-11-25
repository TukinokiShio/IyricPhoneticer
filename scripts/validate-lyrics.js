import { readFile } from 'node:fs/promises';
import { parseLyricPack } from '../src/lyric-pack.js';

const [path] = process.argv.slice(2);
try {
  if (!path) throw new Error('用法：npm run validate-lyrics -- <file.iyric.json>');
  const pack = parseLyricPack(await readFile(path, 'utf8'));
  console.log(`已通过：${pack.song.title} · ${pack.lines.length} 句`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
