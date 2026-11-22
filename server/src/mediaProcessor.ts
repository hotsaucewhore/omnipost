import { execFile } from 'child_process';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { PlatformId, VideoAssetMeta } from '../../shared/platforms';

const execFileAsync = promisify(execFile);

function getFfmpegBinary(): string | null {
  if (typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }
  return null;
}

export interface PreparedJobMedia {
  defaultVideoPath?: string;
  verticalVideoPath?: string;
  extractedThumbnailPath?: string;
}

export function normalizeSubtitleToSrt(raw: string): string {
  const cleaned = raw
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/^WEBVTT[^\n]*\n+/i, '')
    .trim();
  if (!cleaned) return '';

  const blocks = cleaned.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const outBlocks: string[] = [];
  let index = 1;

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;

    // Normalize WebVTT "00:00:01.250" or short "00:01.250" timestamps to SRT "00:00:01,250"
    const normalizedTime = lines[timeLineIdx]
      .replace(/\b(\d{2}:\d{2}:\d{2})\.(\d{3})\b/g, '$1,$2')
      .replace(/(?<!:)\b(\d{2}:\d{2})\.(\d{3})\b/g, '00:$1,$2')
      .replace(/(-->\s*[^\s]+).*$/, '$1');
    const textLines = lines.slice(timeLineIdx + 1);
    if (textLines.length === 0) continue;

    outBlocks.push(`${index}\n${normalizedTime}\n${textLines.join('\n')}`);
    index++;
  }

  return outBlocks.join('\n\n');
}

function buildFfmpegSubtitlesFilter(srtFilePath: string): string {
  // FFmpeg subtitles filter requires forward slashes and escaped drive colons on Windows
  const escaped = srtFilePath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
  return `subtitles='${escaped}':force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00181816,BorderStyle=1,Outline=2,Shadow=0,MarginV=36'`;
}

export async function prepareMediaVariants(
  jobId: string,
  sourceVideoPath: string | undefined,
  existingThumbPath: string | undefined,
  videoMeta: VideoAssetMeta,
  enabledPlatforms: PlatformId[],
  uploadDir: string
): Promise<PreparedJobMedia> {
  const edits = videoMeta.edits;
  if (!sourceVideoPath || !fs.existsSync(sourceVideoPath) || !edits) {
    return {
      defaultVideoPath: sourceVideoPath,
      extractedThumbnailPath: existingThumbPath,
    };
  }

  const ffmpegBin = getFfmpegBinary();
  if (!ffmpegBin) {
    return {
      defaultVideoPath: sourceVideoPath,
      extractedThumbnailPath: existingThumbPath,
    };
  }

  let extractedThumbnailPath = existingThumbPath;

  // 1. Extract cover frame if coverTimestampSec is set and no separate image file was uploaded
  if (!extractedThumbnailPath && typeof edits.coverTimestampSec === 'number') {
    const thumbOut = path.join(uploadDir, `${jobId}_cover.jpg`);
    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        '-ss',
        String(Math.max(0, edits.coverTimestampSec)),
        '-i',
        sourceVideoPath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        thumbOut,
      ]);
      if (fs.existsSync(thumbOut)) {
        extractedThumbnailPath = thumbOut;
      }
    } catch {
      // Fallback gracefully if frame extraction fails on synthetic files
    }
  }

  const isTrimmed =
    edits.trimStartSec > 0 ||
    Math.abs(edits.trimEndSec - videoMeta.durationSec) >= 0.5;
  const trimArgs = isTrimmed
    ? [
        '-ss',
        String(Math.max(0, edits.trimStartSec)),
        '-to',
        String(Math.max(edits.trimStartSec + 0.5, edits.trimEndSec)),
      ]
    : [];

  const needsVerticalCrop =
    edits.reframeMode === 'vertical_crop' ||
    (edits.reframeMode === 'smart_hybrid' &&
      enabledPlatforms.some(
        (p) =>
          p === 'tiktok' || p === 'instagram_reels' || p === 'youtube_shorts'
      ));

  const needsVerticalBlur = edits.reframeMode === 'vertical_blur';

  const needsOriginalVariant =
    edits.reframeMode === 'original' ||
    (edits.reframeMode === 'smart_hybrid' &&
      enabledPlatforms.some(
        (p) => p === 'youtube_long' || p === 'facebook_video'
      ));

  let defaultVideoPath = sourceVideoPath;
  let verticalVideoPath: string | undefined;

  let subtitleFilter: string | null = null;
  if (edits.burnSubtitles && edits.subtitleContent?.trim()) {
    const srtBody = normalizeSubtitleToSrt(edits.subtitleContent);
    if (srtBody) {
      const srtPath = path.join(uploadDir, `${jobId}_captions.srt`);
      fs.writeFileSync(srtPath, srtBody, 'utf-8');
      subtitleFilter = buildFfmpegSubtitlesFilter(srtPath);
    }
  }

  // 2. Render trimmed / subtitled original-aspect file if needed
  if (needsOriginalVariant && (isTrimmed || Boolean(subtitleFilter))) {
    const trimmedOut = path.join(uploadDir, `${jobId}_trimmed.mp4`);
    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        ...trimArgs,
        '-i',
        sourceVideoPath,
        ...(subtitleFilter ? ['-vf', subtitleFilter] : []),
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        trimmedOut,
      ]);
      if (fs.existsSync(trimmedOut)) {
        defaultVideoPath = trimmedOut;
      }
    } catch {
      defaultVideoPath = sourceVideoPath;
    }
  }

  // 3. Render 9:16 vertical crop variant if needed
  if (needsVerticalCrop) {
    const cropOut = path.join(uploadDir, `${jobId}_9x16_crop.mp4`);
    const focusRatio = Math.min(1, Math.max(0, (edits.cropFocusX ?? 50) / 100));
    const baseVf = `crop=min(iw\\,ih*9/16):ih:(iw-min(iw\\,ih*9/16))*${focusRatio.toFixed(
      3
    )}:0,scale=1080:1920`;
    const vf = subtitleFilter ? `${baseVf},${subtitleFilter}` : baseVf;
    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        ...trimArgs,
        '-i',
        sourceVideoPath,
        '-vf',
        vf,
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        cropOut,
      ]);
      if (fs.existsSync(cropOut)) {
        verticalVideoPath = cropOut;
        if (edits.reframeMode === 'vertical_crop') {
          defaultVideoPath = cropOut;
        }
      }
    } catch {
      // Keep original path on fallback
    }
  }

  // 4. Render 9:16 blurred backdrop variant if needed
  if (needsVerticalBlur) {
    const blurOut = path.join(uploadDir, `${jobId}_9x16_blur.mp4`);
    const filterComplex =
      '[0:v]split=2[bg][fg];' +
      '[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:4[bg2];' +
      '[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fg2];' +
      '[bg2][fg2]overlay=(W-w)/2:(H-h)/2[v]';
    try {
      await execFileAsync(ffmpegBin, [
        '-y',
        ...trimArgs,
        '-i',
        sourceVideoPath,
        '-filter_complex',
        filterComplex,
        '-map',
        '[v]',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '23',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        blurOut,
      ]);
      if (fs.existsSync(blurOut)) {
        verticalVideoPath = blurOut;
        defaultVideoPath = blurOut;
      }
    } catch {
      // Keep original path on fallback
    }
  }

  return {
    defaultVideoPath,
    verticalVideoPath,
    extractedThumbnailPath,
  };
}

export function pickVariantForPlatform(
  platformId: PlatformId,
  prepared: PreparedJobMedia
): string | undefined {
  const isShort =
    platformId === 'tiktok' ||
    platformId === 'instagram_reels' ||
    platformId === 'youtube_shorts';
  if (isShort && prepared.verticalVideoPath) {
    return prepared.verticalVideoPath;
  }
  return prepared.defaultVideoPath;
}
