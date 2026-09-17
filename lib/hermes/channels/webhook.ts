import crypto from 'node:crypto';
import { fetchWithTimeout, webhookConfig } from '../config';
import type { DeliveryResult, OutboundMessage } from '../types';

// The generic channel: POST the structured capture straight at whatever Hermes
// actually runs on. Signed the same way GitHub and Stripe sign theirs, so the
// receiving end can reject anything that did not come from this relay.
export async function sendWebhook(msg: OutboundMessage): Promise<DeliveryResult> {
  const cfg = webhookConfig();
  if (!cfg) return { channel: 'WEBHOOK', status: 'SKIPPED', detail: 'not configured' };

  const started = Date.now();
  const payload = JSON.stringify({ type: 'hermes.capture', data: msg.structured, text: msg.plain });
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'hermes-relay/1',
    'x-hermes-capture-id': msg.captureId,
    // Lets the receiver dedupe if we ever retry.
    'idempotency-key': msg.captureId,
  };

  if (cfg.secret) {
    const timestamp = Date.now().toString();
    const signature = crypto
      .createHmac('sha256', cfg.secret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');
    headers['x-hermes-timestamp'] = timestamp;
    headers['x-hermes-signature'] = `sha256=${signature}`;
  }

  try {
    const res = await fetchWithTimeout(cfg.url, { method: 'POST', headers, body: payload });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { channel: 'WEBHOOK', status: 'FAILED', detail: `http ${res.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    return { channel: 'WEBHOOK', status: 'SENT', latencyMs };
  } catch (err) {
    return {
      channel: 'WEBHOOK',
      status: 'FAILED',
      detail: err instanceof Error ? err.message : 'network error',
      latencyMs: Date.now() - started,
    };
  }
}
