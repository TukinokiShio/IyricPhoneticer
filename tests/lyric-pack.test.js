import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { activeLineIndex, lineSeekMs, parseLyricPack } from '../src/lyric-pack.js';

const demo = await readFile(new URL('../public/demo/aurora.iyric.json', import.meta.url), 'utf8');
const demoKo = await readFile(new URL('../public/demo/aurora-ko.iyric.json', import.meta.url), 'utf8');

test('reads the Japanese and Korean demo packages', () => {
  const jp = parseLyricPack(`\uFEFF${demo}`);
  const ko = parseLyricPack(demoKo);
  assert.equal(jp.lines[0].segments[0].reading, 'よあ');
  assert.equal(jp.lines[0].segments[1].reading, undefined);
  assert.equal(ko.language, 'ko');
  assert.ok(ko.lines[0].romanization && ko.lines[0].translation);
});

test('reports the JSON or schema field that failed validation', () => {
  assert.throws(() => parseLyricPack('{'), /无法读取 JSON/);
  const pack = JSON.parse(demo);
  pack.version = 2;
  assert.throws(() => parseLyricPack(JSON.stringify(pack)), /version/);
  pack.version = 1;
  pack.lines[1].startMs = pack.lines[0].startMs;
  assert.throws(() => parseLyricPack(JSON.stringify(pack)), /lines\[1\]\.startMs/);
  pack.lines[1].startMs = pack.song.durationMs;
  assert.throws(() => parseLyricPack(JSON.stringify(pack)), /早于歌曲结束时间/);
  pack.lines[1].startMs = 4000;
  pack.lines[0].segments[0].reading = {};
  assert.throws(() => parseLyricPack(JSON.stringify(pack)), /segments\[0\]\.reading/);
});

test('the player and export select the same line at each offset boundary', () => {
  const { lines } = parseLyricPack(demo);
  const originalStart = lines[0].startMs;
  for (const offsetMs of [-500, 0, 500]) {
    const target = lineSeekMs(lines[0], 14000, offsetMs);
    assert.equal(target, originalStart + offsetMs);
    assert.equal(activeLineIndex(lines, target - 1, offsetMs), -1);
    assert.equal(activeLineIndex(lines, target, offsetMs), 0);
  }
  assert.equal(activeLineIndex(lines, 14000, 0), lines.length - 1);
  assert.equal(activeLineIndex([], 500, 0), -1);
});

test('seeking clamps adjusted starts to the playable interval', () => {
  assert.equal(lineSeekMs({ startMs: 0 }, 14000, -500), 0);
  assert.equal(lineSeekMs({ startMs: 13900 }, 14000, 500), 14000);
});
