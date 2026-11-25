import { activeLineIndex } from './lyric-pack.js';

const LYRIC_FONTS = '"Segoe UI", "Yu Gothic", Meiryo, "Microsoft YaHei UI", "Malgun Gothic", sans-serif';
const WORDS = new Intl.Segmenter(undefined, { granularity: 'word' });
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const SCROLL_MS = 240;
const ROW_GAP = 34;
const READING_COLOR = '#ffe0b7';
const ORIGINAL_COLOR = '#fff9ee';
const TRANSLATION_COLOR = '#e5e3ef';

export function createVideoRenderer(canvas, job, image) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('无法创建歌词视频画布。');
  const { width, height } = canvas;
  const { lines, song } = job.pack;
  const offsetMs = job.offsetMs ?? 0;
  const backdrop = createBackdrop(width, height, image, job.title || song.title, job.artist || song.artist);
  const top = 144;
  const bottom = height - 32;
  const stageCenter = (top + bottom) / 2;

  // Measure once so that the same lyric rows wrap and align in every exported frame.
  let nextTop = 0;
  const rows = lines.map(line => {
    const block = measureLyric(context, line, job.mode, width * 0.84);
    const center = nextTop + (block.height * block.scale) / 2;
    nextTop += block.height * block.scale + ROW_GAP;
    return { ...block, center };
  });
  const initialCenter = rows[0].center - 96;
  const scrolls = [];
  for (const [index, line] of lines.entries()) {
    const start = line.startMs + offsetMs;
    const from = index ? scrollPosition(scrolls[index - 1], start) : initialCenter;
    scrolls.push({ start, from, to: rows[index].center });
  }

  return timeMs => {
    context.drawImage(backdrop, 0, 0);
    const active = activeLineIndex(lines, timeMs, offsetMs);
    const center = active >= 0 ? scrollPosition(scrolls[active], timeMs) : initialCenter;

    context.save();
    context.beginPath();
    context.rect(0, top, width, bottom - top);
    context.clip();

    for (const [index, row] of rows.entries()) {
      const y = stageCenter + row.center - center;
      const half = (row.height * row.scale) / 2;
      if (y + half < top) continue;
      if (y - half > bottom) break;

      const distance = Math.abs(y - stageCenter) / ((bottom - top) / 2);
      const alpha = index === active ? 1 : Math.max(0.04, 0.48 * (1 - distance));
      drawLyric(context, row, width / 2, y, alpha);
    }

    context.restore();
  };
}

function createBackdrop(width, height, image, title, artist) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { alpha: false });
  const ground = ctx.createLinearGradient(0, 0, width, height);
  ground.addColorStop(0, '#373044');
  ground.addColorStop(0.48, '#2b2037');
  ground.addColorStop(1, '#171623');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, width, height);

  if (image?.width && image.height) {
    const scale = Math.max(width / image.width, height / image.height);
    const imageWidth = image.width * scale;
    const imageHeight = image.height * scale;
    ctx.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
  }

  const shade = ctx.createLinearGradient(0, 0, 0, height);
  shade.addColorStop(0, 'rgba(12, 10, 18, 0.80)');
  shade.addColorStop(0.44, 'rgba(18, 12, 24, 0.68)');
  shade.addColorStop(1, 'rgba(13, 12, 20, 0.88)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);

  if (title) {
    ctx.font = `600 25px ${LYRIC_FONTS}`;
    ctx.fillStyle = ORIGINAL_COLOR;
    ctx.fillText(title, 65, 73, width - 130);
  }
  if (artist) {
    ctx.font = `400 18px ${LYRIC_FONTS}`;
    ctx.fillStyle = READING_COLOR;
    ctx.fillText(artist, 65, 102, width - 130);
  }
  return canvas;
}

function scrollPosition({ start, from, to }, timeMs) {
  const t = Math.max(0, Math.min(1, (timeMs - start) / SCROLL_MS));
  return from + (to - from) * (1 - (1 - t) ** 3);
}

function measureLyric(ctx, line, mode, maxWidth) {
  const originalFont = `600 47px ${LYRIC_FONTS}`;
  const readingFont = `500 21px ${LYRIC_FONTS}`;
  const translationFont = `400 25px ${LYRIC_FONTS}`;
  const entries = [];
  const originalText = line.segments.map(segment => segment.text).join('');

  if (mode === 'reading' && line.segments.some(segment => segment.reading)) {
    const tokens = line.segments.flatMap(segment => segment.reading
      ? [{ text: segment.text, reading: segment.reading }]
      : [...WORDS.segment(segment.text)].map(({ segment: text }) => ({ text })));
    const rows = wrapAnnotated(ctx, tokens, maxWidth, originalFont, readingFont);
    for (const tokens of rows) {
      const hasReading = tokens.some(token => token.reading);
      entries.push({
        tokens,
        font: originalFont,
        readingFont,
        baseline: hasReading ? 75 : 52,
        height: hasReading ? 88 : 62,
        direction: textDirection(originalText),
      });
    }
  } else {
    if (mode === 'romanization' && line.romanization) {
      entries.push(...measureTextRows(ctx, line.romanization, maxWidth, readingFont, READING_COLOR, 29));
    }
    entries.push(...measureTextRows(ctx, originalText, maxWidth, originalFont, ORIGINAL_COLOR, 61));
  }

  if (line.translation) {
    entries.push(...measureTextRows(ctx, line.translation, maxWidth, translationFont, TRANSLATION_COLOR, 34));
  }

  const height = entries.reduce((sum, entry) => sum + entry.height, 0);
  return { entries, height, scale: Math.min(1, 240 / Math.max(1, height)) };
}

function measureTextRows(ctx, text, maxWidth, font, color, height) {
  ctx.font = font;
  const rows = [];
  for (const paragraph of text.split(/\r?\n/u)) {
    let current = '';
    for (const { segment } of WORDS.segment(paragraph)) {
      // Unicode grapheme boundaries keep combining marks, emoji and joining sequences intact.
      const parts = ctx.measureText(segment).width <= maxWidth
        ? [segment]
        : [...GRAPHEMES.segment(segment)].map(part => part.segment);
      for (const part of parts) {
        if (current && ctx.measureText(current + part).width > maxWidth) {
          if (current.trim()) rows.push(current.trim());
          current = '';
        }
        current += current ? part : part.trimStart();
      }
    }
    if (current.trim()) rows.push(current.trim());
  }
  return rows.map(row => ({ text: row, font, color, baseline: height * 0.79, height, direction: textDirection(row) }));
}

function wrapAnnotated(ctx, tokens, maxWidth, font, readingFont) {
  const rows = [];
  let row = [];
  let usedWidth = 0;
  for (const token of tokens) {
    if (!token.reading && /^(?:\r\n?|\n)$/u.test(token.text)) {
      rows.push(row);
      row = [];
      usedWidth = 0;
      continue;
    }
    ctx.font = font;
    const originalWidth = ctx.measureText(token.text).width;
    ctx.font = readingFont;
    const readingWidth = ctx.measureText(token.reading || '').width;
    const width = Math.min(maxWidth, Math.max(originalWidth, readingWidth));
    if (row.length && usedWidth + width > maxWidth) {
      rows.push(row);
      row = [];
      usedWidth = 0;
    }
    if (!row.length && !token.reading && !token.text.trim()) continue;
    row.push({ ...token, width });
    usedWidth += width;
  }
  if (row.length) rows.push(row);
  return rows;
}

function textDirection(text) {
  const firstLetter = text.match(/\p{Letter}/u)?.[0];
  return firstLetter && /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}]/u.test(firstLetter)
    ? 'rtl'
    : 'ltr';
}

function drawLyric(ctx, row, x, y, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(row.scale, row.scale);
  ctx.textAlign = 'center';
  let top = -row.height / 2;

  for (const entry of row.entries) {
    ctx.direction = entry.direction;
    if (entry.tokens) {
      const width = entry.tokens.reduce((sum, token) => sum + token.width, 0);
      const direction = entry.direction === 'rtl' ? -1 : 1;
      let edge = (-direction * width) / 2;
      for (const token of entry.tokens) {
        const center = edge + (direction * token.width) / 2;
        ctx.font = entry.font;
        ctx.fillStyle = ORIGINAL_COLOR;
        if (token.width > 0) ctx.fillText(token.text, center, top + entry.baseline, token.width);
        if (token.reading && token.width > 0) {
          ctx.font = entry.readingFont;
          ctx.fillStyle = READING_COLOR;
          ctx.fillText(token.reading, center, top + 25, token.width);
        }
        edge += direction * token.width;
      }
    } else {
      ctx.font = entry.font;
      ctx.fillStyle = entry.color;
      ctx.fillText(entry.text, 0, top + entry.baseline);
    }
    top += entry.height;
  }
  ctx.restore();
}
