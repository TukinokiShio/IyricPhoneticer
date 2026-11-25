import {
  ADTS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  FLAC,
  Input,
  MATROSKA,
  MP3,
  MP4,
  OGG,
  Output,
  Quality,
  WAVE,
  WEBM,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { createVideoRenderer } from './video-layout.js';

const WIDTH = 1280;
const HEIGHT = 720;
const FRAME_RATE = 30;
const SAMPLE_RATE = 48_000;
const VIDEO_QUALITY = new Quality({ bitrate: 2_800_000 });
const AUDIO_QUALITY = new Quality({ bitrate: 128_000 });
const FORMATS = [MP3, MP4, FLAC, OGG, WAVE, ADTS, WEBM, MATROSKA];

let busy = false;

self.addEventListener('message', async ({ data }) => {
  if (data?.type !== 'start') return;

  const { jobId } = data;
  if (busy) {
    self.postMessage({ type: 'error', jobId, message: '已有视频正在导出。' });
    return;
  }

  busy = true;
  try {
    const progress = value => self.postMessage({ type: 'progress', jobId, progress: value });
    progress(0);
    const buffer = await exportVideo(data, progress);
    progress(1);
    self.postMessage({ type: 'done', jobId, buffer }, [buffer]);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: 'error', jobId, message: detail || '视频导出失败。' });
  } finally {
    busy = false;
  }
});

async function exportVideo(job, progress) {
  if (typeof OffscreenCanvas !== 'function' || typeof VideoEncoder !== 'function' ||
      typeof AudioEncoder !== 'function') {
    throw new Error('此浏览器缺少视频导出所需的编码功能，请在新版 Chrome 或 Edge 中使用。');
  }
  if (!(job.audioFile instanceof Blob) || !job.pack?.lines?.length) {
    throw new Error('请先打开歌曲并导入歌词。');
  }

  const input = new Input({ formats: FORMATS, source: new BlobSource(job.audioFile) });
  const target = new BufferTarget();
  const output = new Output({ format: new WebMOutputFormat(), target });
  let audioConversion;

  try {
    const audioTrack = await input.getPrimaryAudioTrack();
    if (!audioTrack) throw new Error('文件中没有可导出音轨。');

    const [duration, inputChannels] = await Promise.all([
      audioTrack.computeDuration(),
      audioTrack.getNumberOfChannels(),
    ]);
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error('无法确定歌曲的可导出时长。');
    }

    const audioSettings = {
      numberOfChannels: Math.min(inputChannels, 2),
      sampleRate: SAMPLE_RATE,
      quality: AUDIO_QUALITY,
    };
    const [canDecode, videoSupported, audioSupported] = await Promise.all([
      audioTrack.canDecode(),
      canEncodeVideo('vp8', {
        width: WIDTH,
        height: HEIGHT,
        frameRate: FRAME_RATE,
        quality: VIDEO_QUALITY,
      }),
      canEncodeAudio('opus', audioSettings),
    ]);
    if (!canDecode) throw new Error('当前浏览器无法解码此歌曲的音轨。');
    if (!videoSupported || !audioSupported) {
      throw new Error('当前浏览器无法编码 720p VP8 和 Opus 视频。');
    }

    const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
    const background = await loadBackground(job.backgroundBlob);
    let render;
    try {
      render = createVideoRenderer(canvas, job, background);
    } finally {
      background?.close();
    }

    const videoSource = new CanvasSource(canvas, { codec: 'vp8', quality: VIDEO_QUALITY });
    output.addVideoTrack(videoSource);
    audioConversion = await Conversion.init({
      input,
      output,
      composable: true,
      tracks: 'primary',
      video: { discard: true },
      audio: { codec: 'opus', ...audioSettings },
      trim: { start: 0, end: duration },
      showWarnings: false,
    });
    if (!audioConversion.isValid || audioConversion.utilizedTracks.length !== 1 ||
        audioConversion.utilizedTracks[0] !== audioTrack) {
      throw new Error('无法将歌曲音轨加入导出视频。');
    }

    await output.start();
    const frameCount = Math.ceil(duration * FRAME_RATE);
    // Keep both tracks within roughly one second so the muxer can write them in order.
    for (let firstFrame = 0; firstFrame < frameCount; firstFrame += FRAME_RATE) {
      const endFrame = Math.min(firstFrame + FRAME_RATE, frameCount);
      const encodeFrames = async () => {
        for (let frame = firstFrame; frame < endFrame; frame++) {
          const time = frame / FRAME_RATE;
          render(time * 1000);
          await videoSource.add(time, Math.min(1 / FRAME_RATE, duration - time));
        }
      };
      const encodeAudio = audioConversion.state === 'done'
        ? Promise.resolve()
        : audioConversion.execute(endFrame === frameCount ? {} : { until: endFrame / FRAME_RATE });
      await Promise.all([encodeFrames(), encodeAudio]);
      progress(Math.min(endFrame / frameCount, 0.99));
    }

    await output.finalize();
    if (!target.buffer?.byteLength) throw new Error('视频导出没有生成可下载文件。');
    return target.buffer;
  } catch (error) {
    // A failure on either track must stop the other track and release the output.
    await Promise.allSettled([audioConversion?.cancel(), output.cancel()]);
    throw error;
  } finally {
    input.dispose();
  }
}

async function loadBackground(blob) {
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}
