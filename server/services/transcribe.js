import { pipeline } from '@xenova/transformers';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

let _transcriber = null;

const getTranscriber = async () => {
    if (!_transcriber) {
        console.log('[Whisper] טוען מודל (פעם ראשונה — עשוי לקחת כמה שניות)...');
        _transcriber = await pipeline('automatic-speech-recognition', 'Xenova/whisper-small', {
            quantized: true,
        });
        console.log('[Whisper] מודל מוכן');
    }
    return _transcriber;
};

const toWav = (inputPath) =>
    new Promise((resolve, reject) => {
        const outPath = path.join(os.tmpdir(), `wa_${randomBytes(6).toString('hex')}.wav`);
        ffmpeg(inputPath)
            .audioChannels(1)
            .audioFrequency(16000)
            .format('wav')
            .on('end', () => resolve(outPath))
            .on('error', reject)
            .save(outPath);
    });

export const transcribeAudio = async (filePath) => {
    let wavPath = null;
    try {
        wavPath = await toWav(filePath);
        const transcriber = await getTranscriber();
        const result = await transcriber(wavPath, {
            language: 'hebrew',
            task: 'transcribe',
            chunk_length_s: 30,
        });
        return result.text?.trim() || null;
    } catch (err) {
        console.error('[Whisper] transcription failed:', err.message);
        return null;
    } finally {
        if (wavPath) try { fs.unlinkSync(wavPath); } catch (_) {}
    }
};
