'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type StartResponse = { ok: true; runId: string; runToken: string } | { ok: false; error: string };

export default function PlayClient({ isPro, runsRemaining }: { isPro: boolean; runsRemaining: number }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const runTokenRef = useRef<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(runsRemaining);

  const fetchToken = useCallback(async () => {
    const res = await fetch('/api/run/start', { method: 'POST' });
    const body = (await res.json()) as StartResponse;
    if ('ok' in body && body.ok) {
      runTokenRef.current = body.runToken;
      setStatus(null);
    } else {
      runTokenRef.current = null;
      setStatus('error' in body ? body.error : 'Could not start run');
    }
  }, []);

  useEffect(() => {
    void fetchToken();
  }, [fetchToken]);

  useEffect(() => {
    // Only trust messages from our own origin. Any other origin is rejected outright.
    const onMessage = async (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { type?: string; value?: number; durationMs?: number };
      if (!data?.type) return;

      if (data.type === 'sr:game-over' && typeof data.value === 'number' && typeof data.durationMs === 'number') {
        const token = runTokenRef.current;
        runTokenRef.current = null;
        if (!token) {
          setStatus('No active run token — score not saved.');
          return;
        }
        const res = await fetch('/api/scores', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ runToken: token, value: data.value, durationMs: data.durationMs }),
        });
        if (!res.ok) {
          setStatus('Score not recorded.');
        } else if (!isPro) {
          setRemaining((r) => Math.max(0, r - 1));
        }
        // Get the next run token (may fail if free tier exhausted; error surfaces in status).
        await fetchToken();
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [fetchToken, isPro]);

  return (
    <main style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#000' }}>
        <a href="/dashboard" style={{ color: '#fff', fontWeight: 600 }}>← Back</a>
        <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
          {isPro ? 'Pro — unlimited runs' : `${remaining} run${remaining === 1 ? '' : 's'} left today`}
        </span>
      </div>
      {status && <div style={{ padding: 12, background: '#2a0000', color: '#ff9b9b' }}>{status}</div>}
      <iframe
        ref={iframeRef}
        title="Space Runner"
        src="/game/index.html"
        sandbox="allow-scripts allow-same-origin"
        style={{ flex: 1, border: 0, width: '100%' }}
      />
    </main>
  );
}
