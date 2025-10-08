// project-root/src/services/lineMedia.js
import axios from 'axios';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import LineMedia from '../models/lineMedia.model.js';

const LINE_DATA_BASE = 'https://api-data.line.me';
const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const MEDIA_ROOT = (process.env.LINE_MEDIA_DIR || path.join(process.cwd(), 'storage', 'line-media')).trim();
const LOCATION_ASSOC_WINDOW_MS = Number(process.env.LINE_LOCATION_ASSOC_WINDOW_MS || 5 * 60 * 1000);

if (!ACCESS_TOKEN) {
  console.warn('[LINE MEDIA] LINE_CHANNEL_ACCESS_TOKEN is missing. Image download will fail.');
}

const dataClient = axios.create({
  baseURL: `${LINE_DATA_BASE}/v2/bot`,
  headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
  responseType: 'stream',
});

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

export async function downloadImage(messageId) {
  if (!ACCESS_TOKEN) throw new Error('LINE access token is not configured.');

  await ensureDir(MEDIA_ROOT);
  const fileName = `${messageId}-${Date.now()}.jpg`;
  const filePath = path.join(MEDIA_ROOT, fileName);

  try {
    const res = await dataClient.get(`/message/${messageId}/content`);
    await pipeline(res.data, fs.createWriteStream(filePath));
    return { filePath, fileName };
  } catch (err) {
    const status = err?.response?.status;
    console.error('[LINE MEDIA] download image failed:', status, err.message);
    throw new Error('ไม่สามารถดาวน์โหลดไฟล์จาก LINE ได้');
  }
}

export async function saveImageMeta({ userId, messageId, timestamp, imagePath, rawEvent }) {
  return LineMedia.create({
    userId,
    messageId,
    type: 'image',
    imagePath,
    timestamp: new Date(timestamp),
    rawEvent,
  });
}

export async function saveLocationMeta({ userId, messageId, timestamp, location, rawEvent }) {
  const createdAt = new Date(timestamp);

  const recentImage = await LineMedia.findOne({
    userId,
    type: 'image',
    timestamp: { $gte: new Date(createdAt.getTime() - LOCATION_ASSOC_WINDOW_MS) },
  })
    .sort({ timestamp: -1 })
    .exec();

  const locationDoc = await LineMedia.create({
    userId,
    messageId,
    type: 'location',
    location,
    timestamp: createdAt,
    relatedMedia: recentImage?._id || null,
    rawEvent,
  });

  if (recentImage) {
    recentImage.relatedMedia = locationDoc._id;
    await recentImage.save();
  }

  return locationDoc;
}
