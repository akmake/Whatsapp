// statusMedia — עיבוד מדיה לפני העלאה כסטטוס, באיכות מקסימלית.
// תמונות: sharp. ווידאו: ffmpeg (קידוד 1080p + חיתוך אוטומטי למקטעי 30ש').
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export const SEGMENT_SECONDS = 30;

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
export async function processVideo(buffer) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'btbvid-'));
  const inPath = path.join(work, 'input');
  const outPattern = path.join(work, 'seg_%03d.mp4');
  fs.writeFileSync(inPath, buffer);

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inPath)
        .videoCodec('libx264')
        .audioCodec('aac')
        .audioBitrate('192k')
        .outputOptions([
          '-profile:v', 'high',
          '-pix_fmt', 'yuv420p',
          '-preset', 'slow',
          '-crf', '16',
          // וואטסאפ לא מקודדת מחדש סטטוס (E2E) — לכן הצלע הארוכה עד 1920 (לא 1080):
          // ההורדה היחידה היא שלנו, וגודל הקובץ עדיין רחוק מהתקרה. פורטרייט נשאר 1080×1920.
          '-vf', "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
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
