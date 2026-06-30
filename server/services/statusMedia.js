// statusMedia — עיבוד מדיה לפני העלאה כסטטוס, באיכות מקסימלית.
// תמונות: sharp. ווידאו: ffmpeg (קידוד 1080p + חיתוך אוטומטי למקטעי 30ש').
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import os from 'os';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export const SEGMENT_SECONDS = 30;

// HDR arrives mostly as HEVC Main10 from modern phones. Main10 alone is not
// sufficient proof of HDR, so detection is based on the stream's colour tags.
// PQ (HDR10/Dolby Vision base layer), HLG and BT.2020 all require conversion
// before creating the 8-bit H.264 file used for a status.
const HDR_TRANSFERS = new Set(['smpte2084', 'arib-std-b67']);

function probeVideoStream(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return resolve({});
      resolve((data.streams || []).find(s => s.codec_type === 'video') || {});
    });
  });
}

function isHdrStream(stream) {
  return HDR_TRANSFERS.has(stream.color_transfer) || stream.color_primaries === 'bt2020';
}

const RESIZE_FILTER = "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";
// For SDR, perform the range/matrix conversion in the pixels as well as tagging
// the output. Merely writing `-color_range tv` would mislabel full-range input.
const SDR_FILTER = `${RESIZE_FILTER},scale=in_range=auto:out_range=tv:out_color_matrix=bt709`;

// Work in linear light, map the HDR luminance into an SDR display range, then
// explicitly produce limited-range BT.709. Without this step a 10-bit HLG/PQ
// source is flattened into yuv420p and appears very bright/washed out.
const HDR_TO_SDR_FILTER = [
  RESIZE_FILTER,
  'zscale=transfer=linear:npl=100',
  'format=gbrpf32le',
  'zscale=primaries=bt709',
  'tonemap=tonemap=hable:desat=0',
  'zscale=transfer=bt709:matrix=bt709:range=limited',
  'format=yuv420p',
].join(',');

// תמונה: עד 1600 בצלע הארוכה (וואטסאפ ממילא מקטין סביב ~1600 — שולחים גבוה
// כדי שההקטנה תהיה שלו ולא שלנו), JPEG q95 4:4:4, sRGB, lanczos3.
export async function processImage(buffer) {
  return await sharp(buffer)
    .rotate() // לפי EXIF
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .toColourspace('srgb')
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toBuffer();
}

// ווידאו: קידוד H.264 High / yuv420p / AAC, עד 1080×1920,
// keyframe כפוי כל 30ש' + segment muxer => חיתוך מדויק למקטעים <=30ש'.
// מחזיר מערך Buffers (מקטע אחד או יותר). ללא ffprobe.
// opts.firstSegmentOnly — מקודד רק את ~30ש' הראשונות (לבדיקת איכות: מהיר וחסכוני בזיכרון).
export async function processVideo(buffer, { firstSegmentOnly = false } = {}) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'btbvid-'));
  const inPath = path.join(work, 'input');
  const outPattern = path.join(work, 'seg_%03d.mp4');
  fs.writeFileSync(inPath, buffer);

  try {
    const sourceStream = await probeVideoStream(inPath);
    const hdr = isHdrStream(sourceStream);
    await new Promise((resolve, reject) => {
      const cmd = ffmpeg(inPath);
      if (firstSegmentOnly) cmd.inputOptions(['-t', String(SEGMENT_SECONDS)]); // קורא רק 30ש' ראשונות
      cmd
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions([
          '-profile:v', 'high',
          '-pix_fmt', 'yuv420p',
          // preset משפיע על מהירות ההמרה וגודל הקובץ — לא על האיכות (שנקבעת ע"י crf).
          // medium = מהיר פי ~2-3 מ-slow, אותה איכות בדיוק, קובץ מעט גדול יותר (לא אכפת לנו).
          '-preset', 'medium',
          '-crf', '16',
          // וואטסאפ לא מקודדת מחדש סטטוס (E2E) — לכן הצלע הארוכה עד 1920 (לא 1080):
          // ההורדה היחידה היא שלנו, וגודל הקובץ עדיין רחוק מהתקרה. פורטרייט נשאר 1080×1920.
          '-vf', hdr ? HDR_TO_SDR_FILTER : SDR_FILTER,
          // Declare the output explicitly. Players must not guess whether the
          // resulting 8-bit H.264 stream is HDR or full-range phone footage.
          '-color_primaries', 'bt709',
          '-color_trc', 'bt709',
          '-colorspace', 'bt709',
          '-color_range', 'tv',
          '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
          '-f', 'segment',
          '-segment_time', String(SEGMENT_SECONDS),
          '-reset_timestamps', '1',
        ])
        .on('end', resolve)
        .on('error', reject)
        .save(outPattern);
    });

    const files = fs.readdirSync(work).filter(f => f.startsWith('seg_')).sort();
    return files.map(f => fs.readFileSync(path.join(work, f)));
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ok */ }
  }
}
