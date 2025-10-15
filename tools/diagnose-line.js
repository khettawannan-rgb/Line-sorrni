#!/usr/bin/env node
import 'dotenv/config.js';
import readline from 'node:readline';
import { pushLineMessage, getBotInfo } from '../project-root/src/services/line.js';

const usage = () => {
  console.log('Usage: node tools/diagnose-line.js <LINE_USER_ID> [message]');
  console.log('Optional: set LINE_TEST_USER_ID in .env to omit the first argument.');
};

const userId = process.argv[2] || process.env.LINE_TEST_USER_ID;
const messageArgIndex = userId === process.argv[2] ? 3 : 2;
const message = process.argv.slice(messageArgIndex).join(' ') || `Diagnostic ping ${new Date().toISOString()}`;

if (!userId) {
  usage();
  process.exit(1);
}

const { LINE_CHANNEL_ACCESS_TOKEN } = process.env;
if (!LINE_CHANNEL_ACCESS_TOKEN) {
  console.error('Missing LINE_CHANNEL_ACCESS_TOKEN. Please set it in your environment.');
  process.exit(1);
}

(async () => {
  try {
    const info = await getBotInfo();
    console.log('Bot info:', { basicId: info?.basicId, displayName: info?.displayName });
  } catch (err) {
    console.warn('Warning: failed to fetch bot info:', err?.response?.status || err?.message || err);
  }

  const payload = [{ type: 'text', text: message }];

  try {
    await pushLineMessage(userId, payload);
    console.log('✅ Sent diagnostic message to', userId);
    process.exit(0);
  } catch (err) {
    const status = err?.response?.status;
    const body = err?.response?.data;
    console.error('❌ Failed to send message:', status || err.message || err);
    if (body) console.error('Response body:', body);
    if (!process.stdin.isTTY) process.exit(1);

    // Optional retry with manual token input
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Retry with another message? (y/N) ', async (answer) => {
      rl.close();
      if (!/^y(es)?$/i.test(answer || '')) {
        process.exit(1);
      }
      try {
        await pushLineMessage(userId, [{ type: 'text', text: `Retry ${Date.now()}` }]);
        console.log('✅ Retry sent');
        process.exit(0);
      } catch (retryErr) {
        console.error('Still failing:', retryErr?.response?.status || retryErr?.message || retryErr);
        process.exit(1);
      }
    });
  }
})();
