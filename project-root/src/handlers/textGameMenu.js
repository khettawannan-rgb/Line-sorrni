// project-root/src/handlers/textGameMenu.js
import { replyText, replyFlex } from '../services/line.js';
import { buildGameMenuFlex } from '../flex/gameMenu.js';
import { withinCooldown, touchCooldown } from '../lib/cooldown.js';
import { track } from '../lib/cdp.js';

export async function onTextGameMenu(ev) {
  try {
    const raw = (ev?.message?.text || '').trim();
    const text = raw.toLowerCase();
    if (!/^(game|เกม|เกมส์)$/.test(text)) return false;

    const userId = ev?.source?.userId || '';
    if (withinCooldown(userId, 'game_menu', 30_000)) {
      await replyText(ev.replyToken, 'เพิ่งส่งเมนูเกมไปเมื่อสักครู่ ลองอีกครั้งในไม่กี่วินาทีครับ');
      return true;
    }

    touchCooldown(userId, 'game_menu', 30_000);
    const liffId = process.env.LIFF_ID_GAMES || process.env.LIFF_ID || '';
    const pickBase = () => {
      const cand = (
        process.env.BASE_URL ||
        process.env.APP_BASE_URL ||
        process.env.PUBLIC_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
        (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
        process.env.RENDER_EXTERNAL_URL ||
        ''
      ).trim();
      if (!cand) return '';
      if (/^https?:\/\//i.test(cand)) return cand.replace(/\/$/, '');
      return `https://${cand.replace(/\/$/, '')}`;
    };
    const baseUrl = pickBase();
    const makeUrl = (game) => {
      if (liffId) return `https://liff.line.me/${liffId}?game=${encodeURIComponent(game)}`;
      if (baseUrl) return `${baseUrl}/liff/index.html?game=${encodeURIComponent(game)}`;
      // As a safety, prefer absolute URL. If still missing, guide user via text.
      return '';
    };
    const externalFallback = !liffId;
    const urls = {
      quizUrl: makeUrl('quiz'),
      runnerUrl: makeUrl('runner'),
      signUrl: makeUrl('sign'),
    };
    if (!urls.quizUrl || !urls.runnerUrl || !urls.signUrl) {
      await replyText(ev.replyToken, 'ยังไม่ได้ตั้งค่า BASE_URL/LIFF_ID สำหรับเกม ชั่วคราวให้เปิด: ' + (baseUrl ? `${baseUrl}/liff/index.html?game=quiz` : 'กรุณาตั้งค่า BASE_URL'));
      return true;
    }
    const flex = buildGameMenuFlex(urls, { externalFallback });
    await replyFlex(ev.replyToken, 'เมนูมินิเกม', flex.contents);
    track('open_menu', { userId, ts: Date.now() });
    return true;
  } catch (err) {
    console.warn('[GAME MENU] handler failed', err?.message || err);
    return false;
  }
}

export default { onTextGameMenu };
