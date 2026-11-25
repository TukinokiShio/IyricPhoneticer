import './style.css';
import { parseBlob, selectCover } from 'music-metadata';
import { activeLineIndex, lineSeekMs, parseLyricPack } from './lyric-pack.js';

const get = (id) => document.getElementById(id);
const audio = get('player');
const audioInput = get('audio-file');
const lyricInput = get('lyrics-file');
const imageInput = get('background-file');
const openLyrics = get('open-lyrics');
const openBackground = get('open-background');
const resetBackground = get('reset-background');
const demoButton = get('try-demo');
const stageMessage = get('stage-message');
const stageTitle = get('stage-title');
const stageDescription = get('stage-description');
const viewport = get('lyrics-viewport');
const lyricList = get('lyric-lines');
const returnButton = get('return-to-current');
const background = get('song-background');
const cover = get('song-cover');
const titleLabel = get('song-title');
const artistLabel = get('song-artist');
const playButton = get('play-toggle');
const playIcon = get('play-icon');
const progress = get('progress');
const currentLabel = get('current-time');
const durationLabel = get('duration');
const readingButton = get('annotation-reading');
const romanizationButton = get('annotation-romaji');
const offsetAdvance = get('offset-advance');
const offsetDelay = get('offset-delay');
const offsetReset = get('offset-reset');
const offsetValue = get('offset-value');
const exportButton = get('export-video');
const cancelButton = get('export-cancel');
const downloadLink = get('export-download');
const exportStatus = get('export-status');
const exportProgress = get('export-progress');
const exportPercent = get('export-percent');
const status = get('status');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const offsetStepMs = 500;
const imageTypes = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
let audioFile = null;
let audioUrl = '';
let embeddedCover = null;
let customBackground = null;
let currentBackdrop = null;
let currentCover = null;
let metadata = {};
let pack = null;
let mode = 'reading';
let offsetMs = 0;
let activeIndex = -1;
let lyricButtons = [];
let following = true;
let frame = null;
let audioRevision = 0;
let audioRequest = 0;
let imageRequest = 0;
let lyricRequest = 0;
let exportNumber = 0;
let exportJob = null;
let exportUrl = '';

function setStatus(message = '', isError = false) {
  status.textContent = message;
  status.hidden = !message;
  status.dataset.error = String(isError);
}

function durationMs() {
  return Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1000) : 0;
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const remainder = String(seconds % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
}

function songDetails() {
  return {
    title: pack?.song.title || metadata.title || audioFile?.name.replace(/\.[^.]+$/, '') || '',
    artist: pack?.song.artist || metadata.artist || '',
  };
}

function syncSongDetails() {
  const { title, artist } = songDetails();
  titleLabel.textContent = title || '未打开音频';
  titleLabel.title = title;
  artistLabel.textContent = artist;
  artistLabel.title = artist;
  artistLabel.hidden = !artist;
}

function replaceImage(image, blob) {
  if (image.src) URL.revokeObjectURL(image.src);
  image.hidden = !blob;
  if (blob) image.src = URL.createObjectURL(blob);
  else image.removeAttribute('src');
}

function syncArtwork() {
  const backdrop = customBackground || embeddedCover;
  if (backdrop !== currentBackdrop) {
    replaceImage(background, backdrop);
    currentBackdrop = backdrop;
  }
  if (embeddedCover !== currentCover) {
    replaceImage(cover, embeddedCover);
    currentCover = embeddedCover;
  }
  resetBackground.hidden = !customBackground;
}

async function decodeImage(blob) {
  if (!imageTypes.has(blob.type.toLowerCase())) throw new Error('请选择 PNG、JPEG、WebP、GIF 或 AVIF 图片。');
  const preview = new Image();
  const url = URL.createObjectURL(blob);
  try {
    preview.src = url;
    await preview.decode();
    if (!preview.naturalWidth || !preview.naturalHeight) throw new Error('图片无法读取。');
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readAudioTags(file, revision) {
  try {
    const { common } = await parseBlob(file);
    if (audioRevision !== revision) return;
    metadata = common;
    syncSongDetails();
    const picture = selectCover(common.picture);
    if (!picture) return;
    const blob = new Blob([picture.data], { type: picture.format });
    await decodeImage(blob);
    if (audioRevision !== revision) return;
    embeddedCover = blob;
    syncArtwork();
  } catch {
    // Optional tags and cover art are independent from audio decoding.
  }
}

function setFollowing(value) {
  following = value;
  returnButton.hidden = !pack || following;
}

function centerCurrent(smooth = true) {
  const target = lyricButtons[activeIndex < 0 ? 0 : activeIndex];
  if (!target || viewport.hidden) return;
  const top = target.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
  viewport.scrollTo({
    top: top - (viewport.clientHeight - target.offsetHeight) / 2,
    behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant',
  });
}

function syncTimeline() {
  const end = durationMs();
  const current = Math.max(0, Math.round(audio.currentTime * 1000));
  const elapsed = formatTime(current);
  const length = formatTime(end);
  progress.max = String(end);
  progress.value = String(current);
  progress.style.setProperty('--seek-position', `${end ? Math.min(100, current / end * 100) : 0}%`);
  progress.setAttribute('aria-valuetext', `${elapsed} / ${length}`);
  currentLabel.textContent = elapsed;
  durationLabel.textContent = length;
  if (!pack) return;
  const nextIndex = activeLineIndex(pack.lines, current, offsetMs);
  if (nextIndex === activeIndex) return;
  lyricButtons[activeIndex]?.removeAttribute('aria-current');
  activeIndex = nextIndex;
  lyricButtons[activeIndex]?.setAttribute('aria-current', 'true');
  if (following) centerCurrent();
}

function updateControls() {
  const canPlay = !!audioFile && !audio.error;
  const hasDuration = canPlay && durationMs() > 0;
  const hasLyrics = !!pack;
  const isPlaying = canPlay && !audio.paused && !audio.ended;
  openLyrics.disabled = !audioFile;
  openBackground.disabled = !audioFile;
  playButton.disabled = !hasDuration;
  playButton.setAttribute('aria-label', isPlaying ? '暂停' : '播放');
  playIcon.setAttribute('href', isPlaying ? '#i-pause' : '#i-play');
  progress.disabled = !hasDuration;
  readingButton.disabled = !hasLyrics;
  romanizationButton.disabled = !hasLyrics;
  offsetAdvance.disabled = !hasLyrics;
  offsetDelay.disabled = !hasLyrics;
  offsetReset.disabled = !hasLyrics || offsetMs === 0;
  exportButton.disabled = !hasDuration || !hasLyrics || !!exportJob;
  cancelButton.hidden = !exportJob;
  downloadLink.hidden = !exportUrl || !!exportJob;
  exportStatus.hidden = !exportJob;
}

function setSeek(ms) {
  const end = durationMs();
  if (!end) return false;
  audio.currentTime = Math.min(Math.max(ms, 0), end) / 1000;
  syncTimeline();
  return true;
}

async function startPlayback() {
  const revision = audioRevision;
  try {
    await audio.play();
  } catch (error) {
    if (revision === audioRevision && error.name !== 'AbortError') {
      setStatus('无法播放该音频。请检查文件格式或尝试打开其他歌曲。', true);
    }
  }
}

function activateLine(line) {
  const end = durationMs();
  if (!end) return;
  setFollowing(true);
  setSeek(lineSeekMs(line, end, offsetMs));
  centerCurrent();
  void startPlayback();
}

function appendText(parent, className, value, lang) {
  const span = document.createElement('span');
  span.className = className;
  span.dir = 'auto';
  span.textContent = value;
  if (lang) span.lang = lang;
  parent.append(span);
  return span;
}

function renderLyrics() {
  viewport.hidden = !pack;
  stageMessage.hidden = !!pack;
  stageTitle.textContent = audioFile ? '等待歌词' : '打开一首歌';
  stageDescription.textContent = audioFile ? '导入这首歌的 .iyric.json 歌词包。' : '导入歌词包，一起看原文、注音和译文。';
  demoButton.hidden = !!audioFile;
  readingButton.textContent = !pack || /^ja(?:-|$)/i.test(pack.language) ? '假名' : '读音';
  readingButton.setAttribute('aria-pressed', String(mode === 'reading'));
  romanizationButton.setAttribute('aria-pressed', String(mode === 'romanization'));
  activeIndex = -1;
  lyricButtons = [];
  const rows = document.createDocumentFragment();
  for (const line of pack?.lines ?? []) {
    const row = document.createElement('li');
    const button = document.createElement('button');
    button.className = 'lyric-line';
    button.type = 'button';
    button.dataset.startMs = String(line.startMs);
    button.addEventListener('click', () => activateLine(line));
    if (mode === 'romanization' && line.romanization) {
      appendText(button, 'lyric-reading', line.romanization);
    }
    const original = appendText(button, 'lyric-original', '', pack.language);
    for (const segment of line.segments) {
      if (mode === 'reading' && segment.reading) {
        const ruby = document.createElement('ruby');
        const reading = document.createElement('rt');
        reading.textContent = segment.reading;
        ruby.append(document.createTextNode(segment.text), reading);
        original.append(ruby);
      } else {
        original.append(document.createTextNode(segment.text));
      }
    }
    if (line.translation) appendText(button, 'lyric-translation', line.translation, pack.translationLanguage);
    row.append(button);
    rows.append(row);
    lyricButtons.push(button);
  }
  lyricList.replaceChildren(rows);
  updateControls();
  syncTimeline();
  if (following) centerCurrent(false);
}

function setOffset(ms) {
  offsetMs = ms;
  const signed = `${ms > 0 ? '+' : ''}${(ms / 1000).toFixed(1)}`;
  offsetValue.textContent = `${signed} s`;
  offsetReset.setAttribute('aria-label', `重置歌词偏移，当前 ${signed} 秒`);
  updateControls();
  syncTimeline();
}

function loadSong(file, lyrics = null) {
  audio.pause();
  const revision = ++audioRevision;
  audioFile = file;
  metadata = {};
  embeddedCover = null;
  customBackground = null;
  pack = lyrics;
  mode = 'reading';
  setFollowing(true);
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(file);
  audio.src = audioUrl;
  audio.load();
  setOffset(0);
  renderLyrics();
  syncArtwork();
  syncSongDetails();
  setStatus('正在读取音频…');
  void readAudioTags(file, revision);
}

function selectedFile(input) {
  const file = input.files?.[0];
  input.value = '';
  return file;
}

get('open-audio').addEventListener('click', () => audioInput.click());
openLyrics.addEventListener('click', () => lyricInput.click());
openBackground.addEventListener('click', () => imageInput.click());

audioInput.addEventListener('change', () => {
  const file = selectedFile(audioInput);
  if (!file) return;
  audioRequest++;
  demoButton.disabled = false;
  loadSong(file);
});

lyricInput.addEventListener('change', async () => {
  const file = selectedFile(lyricInput);
  if (!file || !audioFile) return;
  const revision = audioRevision;
  const request = ++lyricRequest;
  try {
    const lyrics = parseLyricPack(await file.text());
    if (revision !== audioRevision || request !== lyricRequest) return;
    pack = lyrics;
    mode = 'reading';
    setOffset(0);
    setFollowing(true);
    renderLyrics();
    syncSongDetails();
    setStatus('歌词已导入。');
  } catch (error) {
    if (revision === audioRevision && request === lyricRequest) setStatus(`歌词导入失败：${error.message}`, true);
  }
});

imageInput.addEventListener('change', async () => {
  const file = selectedFile(imageInput);
  if (!file || !audioFile) return;
  const revision = audioRevision;
  const request = ++imageRequest;
  try {
    await decodeImage(file);
    if (revision !== audioRevision || request !== imageRequest) return;
    customBackground = file;
    syncArtwork();
    setStatus('背景已更换。');
  } catch {
    if (revision === audioRevision && request === imageRequest) setStatus('无法读取图片。请选择有效的 PNG、JPEG、WebP、GIF 或 AVIF 文件。', true);
  }
});

resetBackground.addEventListener('click', () => {
  imageRequest++;
  customBackground = null;
  syncArtwork();
  openBackground.focus();
  setStatus('已恢复歌曲背景。');
});

demoButton.addEventListener('click', async () => {
  const request = ++audioRequest;
  demoButton.disabled = true;
  setStatus('正在载入示例…');
  try {
    const base = import.meta.env.BASE_URL;
    const [audioResponse, lyricResponse] = await Promise.all([
      fetch(`${base}demo/aurora.mp3`),
      fetch(`${base}demo/aurora.iyric.json`),
    ]);
    if (!audioResponse.ok || !lyricResponse.ok) throw new Error('示例不可用。');
    const [data, lyricText] = await Promise.all([audioResponse.blob(), lyricResponse.text()]);
    if (request !== audioRequest) return;
    loadSong(new File([data], 'aurora.mp3', { type: 'audio/mpeg' }), parseLyricPack(lyricText));
  } catch {
    if (request === audioRequest) setStatus('示例载入失败。可以打开本地音频继续。', true);
  } finally {
    if (request === audioRequest) demoButton.disabled = false;
  }
});

playButton.addEventListener('click', () => {
  if (audio.paused || audio.ended) void startPlayback();
  else audio.pause();
});

progress.addEventListener('input', () => {
  setFollowing(true);
  setSeek(Number(progress.value));
  centerCurrent();
});

progress.addEventListener('keydown', (event) => {
  const direction = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
  if (!direction) return;
  event.preventDefault();
  setFollowing(true);
  setSeek(audio.currentTime * 1000 + direction * 5000);
  centerCurrent();
});

function scheduleFrame() {
  frame = null;
  syncTimeline();
  if (!audio.paused && !audio.ended) frame = requestAnimationFrame(scheduleFrame);
}

audio.addEventListener('loadedmetadata', () => {
  updateControls();
  syncTimeline();
  if (status.textContent === '正在读取音频…') setStatus();
});

audio.addEventListener('durationchange', () => {
  updateControls();
  syncTimeline();
});

audio.addEventListener('play', () => {
  updateControls();
  if (frame === null) scheduleFrame();
});

for (const event of ['pause', 'ended']) {
  audio.addEventListener(event, () => {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    updateControls();
    syncTimeline();
  });
}

for (const event of ['timeupdate', 'seeking', 'seeked']) {
  audio.addEventListener(event, syncTimeline);
}

audio.addEventListener('error', () => {
  updateControls();
  setStatus('无法读取该音频。请尝试打开另一种音频格式或重新选择文件。', true);
});

for (const event of ['wheel', 'touchmove']) {
  viewport.addEventListener(event, () => setFollowing(false), { passive: true });
}

viewport.addEventListener('pointerdown', (event) => {
  if (event.target === viewport) setFollowing(false);
});
viewport.addEventListener('focusin', () => setFollowing(false));

returnButton.addEventListener('click', () => {
  const target = lyricButtons[activeIndex < 0 ? 0 : activeIndex];
  target?.focus({ preventScroll: true });
  setFollowing(true);
  centerCurrent();
});

readingButton.addEventListener('click', () => {
  if (mode === 'reading') return;
  mode = 'reading';
  renderLyrics();
});
romanizationButton.addEventListener('click', () => {
  if (mode === 'romanization') return;
  mode = 'romanization';
  renderLyrics();
});
offsetAdvance.addEventListener('click', () => setOffset(offsetMs - offsetStepMs));
offsetDelay.addEventListener('click', () => setOffset(offsetMs + offsetStepMs));
offsetReset.addEventListener('click', () => setOffset(0));

function finishJob(job, message, isError = false) {
  const restoreFocus = document.activeElement === cancelButton;
  exportJob = null;
  job.worker.terminate();
  setStatus(message, isError);
  updateControls();
  if (restoreFocus) {
    (exportUrl && !isError ? downloadLink : exportButton).focus();
  }
}

function showVideo(job, buffer) {
  if (!(buffer instanceof ArrayBuffer) || !buffer.byteLength) {
    finishJob(job, '生成的视频为空。请重试。', true);
    return;
  }
  if (exportUrl) URL.revokeObjectURL(exportUrl);
  exportUrl = URL.createObjectURL(new Blob([buffer], { type: 'video/webm' }));
  const fileTitle = job.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 110) || '歌曲';
  downloadLink.href = exportUrl;
  downloadLink.download = `${fileTitle}-歌词视频.webm`;
  finishJob(job, `《${job.title}》歌词视频已生成。`);
}

exportButton.addEventListener('click', () => {
  if (!audioFile || !pack || exportJob) return;
  const jobId = ++exportNumber;
  const { title, artist } = songDetails();
  try {
    const worker = new Worker(new URL('./export-worker.js', import.meta.url), { type: 'module' });
    const job = { jobId, title, worker };
    exportJob = job;
    worker.addEventListener('message', ({ data }) => {
      if (exportJob !== job || data?.jobId !== jobId) return;
      if (data.type === 'progress') {
        const percent = Math.max(0, Math.min(100, Math.floor(Number(data.progress) * 100) || 0));
        exportProgress.value = percent;
        exportPercent.textContent = `${percent}%`;
      } else if (data.type === 'done') {
        showVideo(job, data.buffer);
      } else if (data.type === 'error') {
        finishJob(job, data.message || '视频生成失败。请重试。', true);
      }
    });
    worker.addEventListener('error', () => {
      if (exportJob === job) finishJob(job, '视频生成失败。请重试或使用支持视频编码的浏览器。', true);
    });
    worker.addEventListener('messageerror', () => {
      if (exportJob === job) finishJob(job, '无法读取视频生成结果。请重试。', true);
    });
    exportProgress.value = 0;
    exportPercent.textContent = '0%';
    setStatus(`正在生成《${title}》的完整歌词视频…`);
    updateControls();
    worker.postMessage({
      type: 'start', jobId, audioFile, backgroundBlob: customBackground || embeddedCover,
      pack, mode, offsetMs, title, artist,
    });
  } catch {
    if (exportJob) finishJob(exportJob, '无法启动视频生成。请重试。', true);
    else setStatus('无法启动视频生成。请重试。', true);
  }
});

cancelButton.addEventListener('click', () => {
  if (exportJob) finishJob(exportJob, '已取消视频生成。');
});

window.addEventListener('resize', () => {
  if (following) centerCurrent(false);
});

renderLyrics();
