import { fetchWithTimeout, smsConfig } from '../config';
import type { DeliveryResult, OutboundMessage } from '../types';

// Twilio's Messages API. Works with any Hermes agent that reads an SMS inbox,
// and is the channel that still lands when the user's data is off.
export async function sendSms(msg: OutboundMessage): Promise<DeliveryResult> {
  const cfg = smsConfig();
  if (!cfg) return { channel: 'SMS', status: 'SKIPPED', detail: 'not configured' };

  const started = Date.now();
  const body = new URLSearchParams({
    To: cfg.to,
    From: cfg.from,
    // A segment is 160 GSM-7 characters; keep a capture to two segments.
    Body: msg.plain.slice(0, 320),
  });

  try {
    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.accountSid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      },
    );
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { channel: 'SMS', status: 'FAILED', detail: `http ${res.status}: ${text.slice(0, 200)}`, latencyMs };
    }
    return { channel: 'SMS', status: 'SENT', latencyMs };
  } catch (err) {
    return {
      channel: 'SMS',
      status: 'FAILED',
      detail: err instanceof Error ? err.message : 'network error',
      latencyMs: Date.now() - started,
    };
  }
}
