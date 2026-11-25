import assert from 'node:assert/strict';
import test from 'node:test';
import { createVideoRenderer } from '../src/video-layout.js';

class TestCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.text = [];
    this.images = [];
    this.context = {
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      fillText: (text, x, y) => this.text.push({ text, x, y }),
      measureText: text => ({ width: [...text].length * 10 }),
      drawImage: (source, x, y) => {
        this.text.push(...source.text);
        this.images.push({ source, x, y, opacity: this.context.globalAlpha, filter: this.context.filter });
      },
      save() {},
      restore() {},
      beginPath() {},
      rect() {},
      clip() {},
      translate() {},
      scale() {},
    };
  }

  getContext() {
    return this.context;
  }
}

function useTestCanvas(t) {
  const previousCanvas = globalThis.OffscreenCanvas;
  t.after(() => {
    if (previousCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousCanvas;
  });
  globalThis.OffscreenCanvas = TestCanvas;
}

test('reading mode keeps hard line breaks in an unannotated lyric segment', t => {
  useTestCanvas(t);
  const canvas = new TestCanvas(1280, 720);
  const job = {
    mode: 'reading',
    pack: {
      song: { title: 'Example' },
      lines: [{
        startMs: 0,
        segments: [{ text: '愛', reading: 'あい' }, { text: ' first\nsecond' }],
      }],
    },
  };

  createVideoRenderer(canvas, job, null)(400);

  const first = canvas.text.find(({ text }) => text === 'first');
  const second = canvas.text.find(({ text }) => text === 'second');
  assert.ok(first && second, 'both parts are rendered');
  assert.ok(second.y > first.y, 'the second part starts a new visual line');
});

test('video lyrics fade and refocus continuously when the active cue changes', t => {
  useTestCanvas(t);
  const canvas = new TestCanvas(1280, 720);
  const lines = ['first', 'second', 'third'].map((text, index) => ({
    startMs: index * 1000,
    segments: [{ text }],
  }));
  const pack = { song: { title: 'Example' }, lines };
  const render = createVideoRenderer(canvas, { pack }, null);

  function capture(timeMs) {
    canvas.images.length = 0;
    render(timeMs);
    return Object.fromEntries(canvas.images.slice(1).map(({ source, y, opacity, filter }) => [
      source.text[0].text,
      { y, opacity, blur: Number.parseFloat(filter.slice(5)) || 0 },
    ]));
  }

  const before = capture(999);
  assert.deepEqual(capture(1000), before, 'cue start does not jump or snap emphasis');
  assert.equal(before.first.opacity, 1);
  assert.equal(before.first.blur, 0);
  assert.ok(before.third.blur > before.second.blur);

  const fading = capture(1070);
  const settled = capture(1260);
  assert.ok(settled.first.opacity < fading.first.opacity && fading.first.opacity < before.first.opacity);
  assert.ok(before.second.blur > fading.second.blur && fading.second.blur > settled.second.blur);
  assert.ok(settled.second.y < fading.second.y && fading.second.y < before.second.y);
  assert.equal(settled.second.opacity, 1);
  assert.equal(settled.second.blur, 0);
});
