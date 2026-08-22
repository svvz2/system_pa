import 'dotenv/config';
import { createInterface } from 'node:readline';

import { helpText, parseCommand } from './commands.js';
import { GarageSimulator } from './garage-simulator.js';

const deviceId = process.env.DEVICE_ID ?? '30000000-0000-4000-8000-000000000001';
const masterSecret = process.env.DEVICE_MASTER_SECRET;
const functionsUrl = process.env.SUPABASE_FUNCTIONS_URL ?? 'http://127.0.0.1:55321/functions/v1';
const interval = Number(process.env.DEVICE_SYNC_INTERVAL_MS ?? 1000);
if (!masterSecret) throw new Error('Copy simulator/.env.example to simulator/.env and set DEVICE_MASTER_SECRET');

const simulator = new GarageSimulator(deviceId, masterSecret, `${functionsUrl}/device-sync`);
const timer = setInterval(() => void simulator.sync(), interval);
const readline = createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });

process.stdout.write(`Smart Parking ESP32 Simulator\n${helpText}`);
readline.prompt();
readline.on('line', (line) => {
  const command = parseCommand(line);
  if (!command) process.stdout.write('أمر غير معروف. اكتب help.\n');
  else if (command.type === 'help') process.stdout.write(helpText);
  else {
    const result = simulator.handle(command);
    if (result === 'quit') { clearInterval(timer); readline.close(); return; }
    process.stdout.write(`${result}\n`);
  }
  readline.prompt();
});
readline.on('close', () => { clearInterval(timer); process.exit(0); });
