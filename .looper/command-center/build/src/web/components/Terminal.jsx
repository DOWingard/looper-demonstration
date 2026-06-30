// Embedded terminal (c8). Wraps the backend node-pty over WebSocket: attach on mount,
// stream live, reflow the pty on pane resize, and DETACH (not kill) on unmount so the
// process survives. Re-attaches automatically after a WS reconnect. ANSI + scrollback +
// selection/copy are xterm-native.

import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { useStore, wsSend, onPty, toast } from '../lib/store.js';
import { cx } from '../lib/util.js';
import { Icon } from './icons.jsx';
import { Button } from './ui.jsx';

// Land selected terminal text on the clipboard reliably. Prefer the async Clipboard API
// (works on a secure context, including http://127.0.0.1), and fall back to a hidden
// textarea + execCommand so a copy still lands where the Clipboard API is unavailable.
async function writeClipboard(text) {
  if (!text) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

const THEME = {
  background: '#0a0d14',
  foreground: '#e7ebf3',
  cursor: '#5b9dff',
  selectionBackground: '#2b4a7a88',
  black: '#0a0d14', red: '#f87171', green: '#34d399', yellow: '#fbbf24',
  blue: '#5b9dff', magenta: '#c084fc', cyan: '#56d4dd', white: '#e7ebf3',
  brightBlack: '#626c82',
};

export function TerminalView({ sessionKey, cwd, sessionCmd }) {
  const elRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const exitRef = useRef(null);
  const copyRef = useRef(null);
  const connection = useStore((s) => s.connection);

  useEffect(() => {
    if (!sessionKey || !elRef.current) return undefined;
    const term = new XTerm({
      fontFamily: "var(--font-mono), 'JetBrains Mono', Menlo, monospace",
      fontSize: 12.5,
      lineHeight: 1.25,
      cursorBlink: true,
      scrollback: 5000,
      theme: THEME,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(elRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    term.writeln(`\x1b[2m— attaching ${sessionCmd || 'session'} in ${cwd || '~'} —\x1b[0m`);

    const unsub = onPty(sessionKey, (m) => {
      if (m.type === 'pty.data') term.write(m.data);
      else if (m.type === 'pty.exit') {
        term.writeln(`\r\n\x1b[2m— process exited (code ${m.code}) — press Respawn to relaunch —\x1b[0m`);
        if (exitRef.current) exitRef.current.style.display = 'flex';
      }
    });

    const attach = () => wsSend({ type: 'pty.attach', id: sessionKey, cwd, cols: term.cols, rows: term.rows });
    attach();

    const onData = term.onData((d) => wsSend({ type: 'pty.input', id: sessionKey, data: d }));

    const copySelection = async () => {
      const sel = term.getSelection();
      if (!sel) return;
      const ok = await writeClipboard(sel);
      toast(ok ? 'Copied to clipboard' : 'Copy blocked by the browser');
    };

    // Ctrl/Cmd+C copies when there is a selection; otherwise it falls through as SIGINT.
    term.attachCustomKeyEventHandler((e) => {
      const cmd = e.ctrlKey || e.metaKey;
      if (e.type === 'keydown' && cmd && (e.key === 'c' || e.key === 'C') && term.hasSelection()) {
        copySelection();
        return false;
      }
      if (e.type === 'keydown' && cmd && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
        navigator.clipboard?.readText().then((t) => t && wsSend({ type: 'pty.input', id: sessionKey, data: t }));
        return false;
      }
      return true;
    });

    // A native/programmatic copy (browser Ctrl+C, right-click → Copy, or document.execCommand)
    // carries xterm's selection — xterm keeps its own selection model, so without this the
    // DOM copy event would see an empty Selection. This is the most robust copy path.
    const onCopy = (e) => {
      if (!term.hasSelection()) return;
      e.clipboardData?.setData('text/plain', term.getSelection());
      e.preventDefault();
    };
    elRef.current.addEventListener('copy', onCopy);

    // Reveal a one-click Copy affordance whenever there is a selection.
    const onSel = term.onSelectionChange(() => {
      if (copyRef.current) copyRef.current.style.display = term.hasSelection() ? 'flex' : 'none';
    });
    termRef.current._copy = copySelection;

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        wsSend({ type: 'pty.resize', id: sessionKey, cols: term.cols, rows: term.rows });
      } catch {
        /* fit can throw mid-teardown */
      }
    });
    ro.observe(elRef.current);

    termRef.current._reattach = attach;

    return () => {
      ro.disconnect();
      onData.dispose();
      onSel.dispose();
      elRef.current?.removeEventListener('copy', onCopy);
      unsub();
      // Detach (server keeps the process running for reattach), then dispose locally.
      wsSend({ type: 'pty.detach', id: sessionKey });
      term.dispose();
      termRef.current = null;
    };
  }, [sessionKey, cwd, sessionCmd]);

  // After a reconnect, re-attach to the surviving process (replays scrollback).
  useEffect(() => {
    if (connection === 'open' && termRef.current?._reattach) {
      const t = setTimeout(() => termRef.current?._reattach?.(), 120);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [connection]);

  return (
    <div className="relative h-full w-full bg-bg" data-terminal>
      <div ref={elRef} className="absolute inset-0 p-2" />
      <div ref={copyRef} style={{ display: 'none' }} className="absolute top-2.5 right-3">
        <Button variant="outline" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => termRef.current?._copy?.()} title="Copy selection (⌘/Ctrl+C)">
          <Icon.copy size={12} /> Copy
        </Button>
      </div>
      <div ref={exitRef} style={{ display: 'none' }} className="absolute bottom-3 right-3">
        <Button variant="primary" size="sm" onClick={() => { wsSend({ type: 'pty.kill', id: sessionKey }); termRef.current?._reattach?.(); if (exitRef.current) exitRef.current.style.display = 'none'; }}>
          <Icon.refresh size={12} /> Respawn
        </Button>
      </div>
    </div>
  );
}
