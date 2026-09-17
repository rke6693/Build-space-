'use client';

import { useState } from 'react';

type Device = {
  id: string;
  name: string;
  platform: string;
  model: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

// The browser half of pairing: mint a code here, type it into the iPhone app
// once, and the watch is bound for good. The code is displayed and never
// stored in plaintext, so refreshing the page issues a new one.
export default function PairingPanel({ initialDevices }: { initialDevices: Device[] }) {
  const [devices, setDevices] = useState(initialDevices);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mintCode() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hermes/device', { method: 'POST' });
      const body = (await res.json()) as { ok?: boolean; code?: string; expiresAt?: string; error?: string };
      if (!res.ok || !body.code) throw new Error(body.error ?? 'could not create a code');
      setCode(body.code);
      setExpiresAt(body.expiresAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(deviceId: string) {
    if (!confirm('Revoke this device? It will stop sending captures immediately.')) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/hermes/device', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) throw new Error('could not revoke that device');
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, revokedAt: new Date().toISOString() } : d)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'something went wrong');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="card">
        <strong>Pair a device</strong>
        {code ? (
          <>
            <p style={{ marginTop: 12 }}>Enter this in the Hermes iPhone app:</p>
            <p
              style={{
                color: '#fff',
                fontSize: 40,
                fontWeight: 800,
                letterSpacing: 6,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                margin: '12px 0',
              }}
            >
              {code}
            </p>
            <p>
              Single use, expires{' '}
              {expiresAt ? new Date(expiresAt).toLocaleTimeString() : 'in 10 minutes'}.
            </p>
          </>
        ) : (
          <p style={{ marginTop: 12 }}>
            Generates a one-time code. You only do this once per watch.
          </p>
        )}
        <button
          type="button"
          className="btn"
          onClick={mintCode}
          disabled={busy}
          style={{ marginTop: 16 }}
        >
          {code ? 'New code' : 'Generate code'}
        </button>
        {error ? <p style={{ color: '#ff8080', marginTop: 12 }}>{error}</p> : null}
      </div>

      <h2>Devices</h2>
      {devices.length === 0 ? (
        <p>No devices paired yet.</p>
      ) : (
        <div className="row">
          {devices.map((d) => (
            <div key={d.id} className="card" style={{ flex: 1, minWidth: 260 }}>
              <strong style={{ color: d.revokedAt ? 'var(--muted)' : '#fff' }}>{d.name}</strong>
              <p style={{ marginTop: 8 }}>
                {d.platform}
                {d.model ? ` · ${d.model}` : ''}
              </p>
              <p>
                {d.revokedAt
                  ? `Revoked ${new Date(d.revokedAt).toLocaleDateString()}`
                  : d.lastSeenAt
                    ? `Last seen ${new Date(d.lastSeenAt).toLocaleString()}`
                    : 'Never used'}
              </p>
              {!d.revokedAt && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => revoke(d.id)}
                  disabled={busy}
                  style={{ marginTop: 12 }}
                >
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
