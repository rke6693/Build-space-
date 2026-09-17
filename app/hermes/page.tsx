import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { enabledChannels } from '@/lib/hermes/config';
import { llmRefinementEnabled } from '@/lib/hermes/llm';
import PairingPanel from './PairingPanel';

export const dynamic = 'force-dynamic';

const INTENT_ICON: Record<string, string> = {
  REMINDER: '⏰',
  TASK: '✅',
  LIST_ADD: '🧾',
  NOTE: '📝',
  MESSAGE: '💬',
  QUESTION: '❓',
  TIMER: '⏱️',
  UNKNOWN: '🎙️',
};

const STATUS_COLOR: Record<string, string> = {
  DELIVERED: '#4ade80',
  PARTIAL: '#fbbf24',
  FAILED: '#f87171',
  PENDING: 'var(--muted)',
};

export default async function HermesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <main className="container">
        <p>Not signed in.</p>
      </main>
    );
  }
  const userId = session.user.id;

  const [devices, captures] = await Promise.all([
    db.hermesDevice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, name: true, platform: true, model: true,
        createdAt: true, lastSeenAt: true, revokedAt: true,
      },
    }),
    db.hermesCapture.findMany({
      where: { userId },
      orderBy: { capturedAt: 'desc' },
      take: 25,
      select: {
        id: true, transcript: true, intent: true, title: true, dueAt: true,
        status: true, capturedAt: true, classifier: true, confidence: true,
        deliveries: { select: { channel: true, status: true } },
      },
    }),
  ]);

  const channels = enabledChannels();

  return (
    <main className="container">
      <nav style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 32 }}>
        <strong>Hermes relay</strong>
        <Link href="/dashboard" className="btn secondary">Dashboard</Link>
      </nav>

      <h1>Hermes</h1>
      <p style={{ maxWidth: 640, marginTop: 12 }}>
        Press the Action button on your Apple Watch, speak, and it lands with your agent.
      </p>

      <div className="row" style={{ marginTop: 24 }}>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <strong>Channels</strong>
          <p style={{ color: '#fff', fontSize: 20, marginTop: 8 }}>
            {channels.length > 0 ? channels.join(', ') : 'None configured'}
          </p>
          {channels.length === 0 && (
            <p style={{ marginTop: 8 }}>
              Set HERMES_TELEGRAM_BOT_TOKEN or HERMES_WEBHOOK_URL to start delivering.
            </p>
          )}
        </div>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <strong>Understanding</strong>
          <p style={{ color: '#fff', fontSize: 20, marginTop: 8 }}>
            {llmRefinementEnabled() ? 'Claude + rules' : 'Rules only'}
          </p>
          <p style={{ marginTop: 8 }}>
            {llmRefinementEnabled()
              ? 'Messy dictation gets cleaned up before it reaches the agent.'
              : 'Set ANTHROPIC_API_KEY to add the model pass.'}
          </p>
        </div>
        <div className="card" style={{ flex: 1, minWidth: 220 }}>
          <strong>Captures</strong>
          <p style={{ color: '#fff', fontSize: 20, marginTop: 8 }}>{captures.length}</p>
          <p style={{ marginTop: 8 }}>most recent 25</p>
        </div>
      </div>

      <h2>Setup</h2>
      <PairingPanel
        initialDevices={devices.map((d) => ({
          ...d,
          createdAt: d.createdAt.toISOString(),
          lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
          revokedAt: d.revokedAt?.toISOString() ?? null,
        }))}
      />

      <h2>Recent captures</h2>
      {captures.length === 0 ? (
        <p>Nothing yet. Pair a watch and say something.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {captures.map((c) => (
            <div key={c.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                <span style={{ color: '#fff' }}>
                  {INTENT_ICON[c.intent] ?? '🎙️'} {c.title || c.transcript}
                </span>
                <span style={{ color: STATUS_COLOR[c.status], whiteSpace: 'nowrap', fontSize: 14 }}>
                  {c.status.toLowerCase()}
                </span>
              </div>
              <p style={{ marginTop: 6, fontSize: 14 }}>
                {c.dueAt ? `due ${c.dueAt.toLocaleString()} · ` : ''}
                {c.capturedAt.toLocaleString()} · {c.classifier} {Math.round(c.confidence * 100)}%
                {c.deliveries.length > 0
                  ? ` · ${c.deliveries.map((d) => `${d.channel.toLowerCase()} ${d.status.toLowerCase()}`).join(', ')}`
                  : ''}
              </p>
              {c.title && c.title.toLowerCase() !== c.transcript.toLowerCase() && (
                <p style={{ marginTop: 4, fontSize: 13, fontStyle: 'italic' }}>
                  heard: “{c.transcript}”
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
