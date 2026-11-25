function invalid(path, detail) {
  throw new Error(`${path}：${detail}`);
}

function object(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid(path, '应为对象');
  }
}

function requiredText(value, path) {
  if (typeof value !== 'string' || !value.trim()) {
    invalid(path, '应为非空文本');
  }
}

function optionalText(value, path) {
  if (value !== undefined && typeof value !== 'string') {
    invalid(path, '应为文本');
  }
}

export function validateLyricPack(pack) {
  object(pack, '歌词包');
  if (pack.version !== 1) invalid('version', '当前支持版本 1');

  object(pack.song, 'song');
  requiredText(pack.song.title, 'song.title');
  optionalText(pack.song.artist, 'song.artist');
  const durationMs = pack.song.durationMs;
  if (durationMs !== undefined && (!Number.isSafeInteger(durationMs) || durationMs <= 0)) {
    invalid('song.durationMs', '应为正整数毫秒');
  }

  requiredText(pack.language, 'language');
  optionalText(pack.translationLanguage, 'translationLanguage');
  if (pack.sources !== undefined) {
    if (!Array.isArray(pack.sources)) invalid('sources', '应为数组');
    for (const [index, source] of pack.sources.entries()) {
      const path = `sources[${index}]`;
      object(source, path);
      requiredText(source.kind, `${path}.kind`);
      requiredText(source.label, `${path}.label`);
      optionalText(source.url, `${path}.url`);
    }
  }

  if (!Array.isArray(pack.lines) || !pack.lines.length) {
    invalid('lines', '至少需要一句带时间轴的歌词');
  }

  let previousStartMs = -1;
  for (const [index, line] of pack.lines.entries()) {
    const path = `lines[${index}]`;
    object(line, path);
    if (!Number.isSafeInteger(line.startMs) || line.startMs < 0) {
      invalid(`${path}.startMs`, '应为非负整数毫秒');
    }
    if (line.startMs <= previousStartMs) invalid(`${path}.startMs`, '应晚于上一句');
    if (durationMs !== undefined && line.startMs >= durationMs) {
      invalid(`${path}.startMs`, '应早于歌曲结束时间');
    }
    previousStartMs = line.startMs;

    if (!Array.isArray(line.segments) || !line.segments.length) {
      invalid(`${path}.segments`, '至少需要一个原文片段');
    }
    for (const [segmentIndex, segment] of line.segments.entries()) {
      const segmentPath = `${path}.segments[${segmentIndex}]`;
      object(segment, segmentPath);
      if (typeof segment.text !== 'string' || !segment.text.length) {
        invalid(`${segmentPath}.text`, '应为非空文本');
      }
      optionalText(segment.reading, `${segmentPath}.reading`);
    }
    requiredText(line.segments.map(({ text }) => text).join(''), `${path}.segments`);
    optionalText(line.romanization, `${path}.romanization`);
    optionalText(line.translation, `${path}.translation`);
  }

  return pack;
}

export function parseLyricPack(jsonText) {
  let pack;
  try {
    pack = JSON.parse(jsonText.replace(/^\uFEFF/, ''));
  } catch (error) {
    invalid('歌词文件', `无法读取 JSON（${error.message}）`);
  }
  return validateLyricPack(pack);
}

// Positive offsets make all cues appear later in the source audio.
export function activeLineIndex(lines, timeMs, offsetMs = 0) {
  const lyricTimeMs = timeMs - offsetMs;
  let low = 0;
  let high = lines.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (lines[middle].startMs <= lyricTimeMs) low = middle + 1;
    else high = middle;
  }
  return low - 1;
}

export function lineSeekMs(line, durationMs, offsetMs = 0) {
  const targetMs = Math.max(0, line.startMs + offsetMs);
  return Number.isFinite(durationMs) ? Math.min(targetMs, durationMs) : targetMs;
}
