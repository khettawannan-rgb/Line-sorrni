// project-root/src/lib/cdp.js
// Mock CDP tracker: append events to storage/cdp_events.json
import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.resolve('storage');
const CDP_FILE = path.join(STORAGE_DIR, 'cdp_events.json');

function ensure() {
  if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
  if (!fs.existsSync(CDP_FILE)) fs.writeFileSync(CDP_FILE, '[]');
}

export function track(name, payload = {}) {
  try {
    ensure();
    const list = JSON.parse(fs.readFileSync(CDP_FILE, 'utf8')) || [];
    const evt = { name, ts: Date.now(), ...payload };
    list.push(evt);
    fs.writeFileSync(CDP_FILE, JSON.stringify(list.slice(-5000), null, 2));
    return true;
  } catch (err) {
    console.warn('[CDP MOCK] track failed', err?.message || err);
    return false;
  }
}

export default { track };

