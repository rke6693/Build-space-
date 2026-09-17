import { emailConfig, fetchWithTimeout } from '../config';
import type { DeliveryResult, OutboundMessage } from '../types';

// Last-resort channel, and the one that gives the capture a permanent home in
// a searchable archive. Uses the Resend key the app already has.
export async function sendEmail(msg: OutboundMessage): Promise<DeliveryResult> {
  const cfg = emailConfig();
  if (!cfg) return { channel: 'EMAIL', status: 'SKIPPED', detail: 'not configured' };

  const started = Date.now();
  try {
    const res = await fetchWithTimeout('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [cfg.to],
        subject: msg.subject,
        text: `${msg.plain}\n\n---\n${JSON.stringify(msg.structured, null, 2)}`,
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { channel: 'EMAIL', status: 'FAILED', detail: `http ${res.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    return { channel: 'EMAIL', status: 'SENT', latencyMs };
  } catch (err) {
    return {
      channel: 'EMAIL',
      status: 'FAILED',
      detail: err instanceof Error ? err.message : 'network error',
      latencyMs: Date.now() - started,
    };
  }
}
