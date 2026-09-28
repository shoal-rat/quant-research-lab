import type { LabEvent } from "./types";

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status}`);
  return r.json();
}

export const api = {
  get: <T = any>(p: string) => req<T>("GET", p),
  post: <T = any>(p: string, b?: unknown) => req<T>("POST", p, b ?? {}),
};

/** WebSocket with automatic reconnect. */
export function connect(onEvent: (e: LabEvent) => void, onState: (up: boolean) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let timer: number | undefined;
  let ping: number | undefined;
  const open = () => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => {
      onState(true);
      ping = window.setInterval(() => ws?.readyState === 1 && ws.send("ping"), 20000);
    };
    ws.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      onState(false);
      window.clearInterval(ping);
      if (!closed) timer = window.setTimeout(open, 2000);
    };
  };
  open();
  return () => {
    closed = true;
    window.clearTimeout(timer);
    ws?.close();
  };
}
