// WebSocket hub. Broadcasts live feed/session updates to every client and multiplexes
// per-client terminal attach/detach/input/resize onto the pty registry. On disconnect a
// client's ptys are detached, NOT killed (they survive for reattach). Model updates are
// fanned out from one set of listeners so a delta is O(clients) to push, not a re-read.

import { WebSocketServer } from 'ws';

export function attachWsHub(httpServer, ctx) {
  const { model, ptyRegistry } = ctx;
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const clients = new Set();

  function broadcast(msg) {
    const s = JSON.stringify(msg);
    for (const ws of clients) {
      if (ws.readyState === ws.OPEN) ws.send(s);
    }
  }

  model.on('feed', (items) => broadcast({ type: 'feed', items }));
  model.on('session', (summary) => broadcast({ type: 'session', summary }));
  model.on('session-add', (summary) => broadcast({ type: 'session-add', summary }));
  model.on('session-remove', ({ key }) => broadcast({ type: 'session-remove', key }));

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.attachments = new Map(); // ptyId -> client adapter
    const snapshot = model.snapshot();
    ws.send(JSON.stringify({ type: 'hello', snapshot, sessionCmd: ctx.config.sessionCmd }));

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      switch (msg.type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;
        case 'pty.attach': {
          const id = msg.id;
          if (ws.attachments.has(id)) break;
          const adapter = {
            onData: (data) => {
              if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'pty.data', id, data }));
            },
            onExit: (code) => {
              if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: 'pty.exit', id, code }));
            },
          };
          ws.attachments.set(id, adapter);
          const info = ptyRegistry.attach(id, adapter, {
            cwd: msg.cwd,
            cols: msg.cols || 80,
            rows: msg.rows || 30,
          });
          ws.send(JSON.stringify({ type: 'pty.attached', id, info }));
          break;
        }
        case 'pty.input':
          ptyRegistry.input(msg.id, msg.data);
          break;
        case 'pty.resize':
          ptyRegistry.resize(msg.id, msg.cols, msg.rows);
          break;
        case 'pty.detach': {
          const adapter = ws.attachments.get(msg.id);
          if (adapter) ptyRegistry.detach(msg.id, adapter);
          ws.attachments.delete(msg.id);
          break;
        }
        case 'pty.kill':
          ptyRegistry.kill(msg.id);
          break;
        default:
          break;
      }
    });

    ws.on('close', () => {
      clients.delete(ws);
      // Detach (do not kill) so processes survive a reload/disconnect for reattach.
      for (const [id, adapter] of ws.attachments) ptyRegistry.detach(id, adapter);
      ws.attachments.clear();
    });
    ws.on('error', () => {});
  });

  return { wss, broadcast, clients };
}
