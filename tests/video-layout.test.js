import assert from 'node:assert/strict';
import test from 'node:test';
import { createVideoRenderer } from '../src/video-layout.js';

class TestCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.text = [];
    this.context = {
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {},
      fillText: (text, x, y) => this.text.push({ text, x, y }),
      measureText: text => ({ width: [...text].length * 10 }),
      drawImage() {},
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

test('reading mode keeps hard line breaks in an unannotated lyric segment', t => {
  const previousCanvas = globalThis.OffscreenCanvas;
  t.after(() => {
    if (previousCanvas === undefined) delete globalThis.OffscreenCanvas;
    else globalThis.OffscreenCanvas = previousCanvas;
  });
  globalThis.OffscreenCanvas = TestCanvas;

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
