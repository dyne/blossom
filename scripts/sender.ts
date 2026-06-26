import { WebSocketServer } from 'ws';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PORT = parseInt(process.env.PORT || '8080', 10);
const FIXTURE = process.env.FIXTURE || 'fixtures/small.log';
const SPEED_MS = parseInt(process.env.SPEED || '200', 10);

const fixturePath = resolve(FIXTURE);
const lines = readFileSync(fixturePath, 'utf-8')
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean);

console.log(`Blossom demo sender`);
console.log(`  fixture: ${FIXTURE} (${lines.length} lines)`);
console.log(`  speed: ${SPEED_MS}ms per line`);
console.log(`  port: ${PORT}`);

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log(`  listening on ws://localhost:${PORT}/stream`);
});

wss.on('connection', (ws) => {
  console.log(`  client connected, sending ${lines.length} lines...`);
  let i = 0;

  function sendNext(): void {
    if (i >= lines.length) {
      console.log(`  done, loop back to start`);
      i = 0;
    }
    const line = lines[i]!;
    ws.send(line + '\n');
    i++;
    if (ws.readyState === ws.OPEN) {
      setTimeout(sendNext, SPEED_MS);
    }
  }

  sendNext();

  ws.on('close', () => {
    console.log(`  client disconnected`);
  });
});
