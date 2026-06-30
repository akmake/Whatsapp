// statusProbe — כלי מדידה (reverse-engineering): מנתח את הספק המדויק של מדיה.
// משמש למדוד מה וואטסאפ באמת מייצר לסטטוסים, כדי שנקודד אליו בדיוק.
import ffmpeg from 'fluent-ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import sharp from 'sharp';
import fs from 'fs';
import os from 'os';
import path from 'path';

ffmpeg.setFfprobePath(ffprobeInstaller.path);

// תמונה: sharp נותן chroma subsampling + מרחב צבע — קריטי להתאמה
export async function probeImage(buffer) {
  const m = await sharp(buffer).metadata();
  return {
    kind: 'image',
    format: m.format,
    width: m.width,
    height: m.height,
    space: m.space,                       // srgb / cmyk...
    chromaSubsampling: m.chromaSubsampling, // '4:2:0' / '4:4:4'
    isProgressive: m.isProgressive,
    density: m.density,
    bytes: buffer.length,
  };
}

// ווידאו: ffprobe נותן codec/profile/pix_fmt/bitrate/fps/אודיו
export function probeVideo(buffer) {
  const tmp = path.join(os.tmpdir(), `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, buffer);
  return new Promise((resolve) => {
    ffmpeg.ffprobe(tmp, (err, data) => {
      try { fs.rmSync(tmp, { force: true }); } catch {}
      if (err) return resolve({ kind: 'video', error: err.message, bytes: buffer.length });
      const v = (data.streams || []).find(s => s.codec_type === 'video') || {};
      const a = (data.streams || []).find(s => s.codec_type === 'audio') || {};
      const f = data.format || {};
      resolve({
        kind: 'video',
        container: f.format_name,
        durationSec: f.duration ? Number(f.duration) : undefined,
        bytes: buffer.length,
        totalBitrate: f.bit_rate ? Math.round(f.bit_rate / 1000) + 'k' : undefined,
        video: {
          codec: v.codec_name,
          profile: v.profile,
          level: v.level,
          width: v.width,
          height: v.height,
          pixFmt: v.pix_fmt,
          fps: v.avg_frame_rate,
          bitrate: v.bit_rate ? Math.round(v.bit_rate / 1000) + 'k' : undefined,
        },
        audio: a.codec_name ? {
          codec: a.codec_name,
          profile: a.profile,
          sampleRate: a.sample_rate,
          channels: a.channels,
          bitrate: a.bit_rate ? Math.round(a.bit_rate / 1000) + 'k' : undefined,
        } : null,
      });
    });
  });
}

export async function probeMedia(buffer, isVideo) {
  return isVideo ? await probeVideo(buffer) : await probeImage(buffer);
}
