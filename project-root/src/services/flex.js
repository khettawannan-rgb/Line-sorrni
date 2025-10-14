import fetch from 'node-fetch';
import { liffLink } from '../utils/liff.js';

const API = 'https://api.line.me/v2/bot/message/push';
const AUTH = process.env.LINE_CHANNEL_ACCESS_TOKEN
  ? `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
  : null;

export async function pushFlex(userId, contents, altText = 'NILA · Admin') {
  if (!AUTH) throw new Error('Missing LINE_CHANNEL_ACCESS_TOKEN env');
  if (!userId) throw new Error('userId is required');
  if (!contents) throw new Error('contents is required');

  const body = {
    to: userId,
    messages: [{ type: 'flex', altText, contents }],
  };

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: AUTH,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE push failed: ${res.status} ${text}`);
  }
  return true;
}

export function flexAdminShortcuts(prId = 'PR_DEMO_ID') {
  return {
    type: 'bubble',
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: 'NILA · Admin', weight: 'bold', size: 'lg' },
        {
          type: 'button',
          style: 'primary',
          action: { type: 'uri', label: 'PR Dashboard', uri: liffLink('/admin/pr') },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'uri', label: 'สร้าง PO ใหม่', uri: liffLink('/admin/po/new') },
        },
        {
          type: 'button',
          style: 'secondary',
          action: { type: 'uri', label: 'อนุมัติ PR นี้', uri: liffLink(`/line/approve/pr/${prId}`) },
        },
      ],
    },
  };
}
