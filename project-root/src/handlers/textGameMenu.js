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
    const liffId = process.env.LIFF_ID || '';
    const makeUrl = (game) => `https://liff.line.me/${liffId}?game=${encodeURIComponent(game)}`;
    const flex = buildGameMenuFlex({
      quizUrl: makeUrl('quiz'),
      runnerUrl: makeUrl('runner'),
      signUrl: makeUrl('sign'),
    });
    // Use replyFlex helper
    await replyFlex(ev.replyToken, 'เมนูมินิเกม', flex.contents);
    track('open_menu', { userId, ts: Date.now() });
    return true;
  } catch (err) {
    console.warn('[GAME MENU] handler failed', err?.message || err);
    return false;
  }
}

export default { onTextGameMenu };

