import { sendEmail } from './channels/email';
import { sendSms } from './channels/sms';
import { sendTelegram } from './channels/telegram';
import { sendWebhook } from './channels/webhook';
import { enabledChannels, type Channel } from './config';
import type { DeliveryResult, OutboundMessage } from './types';

// Fan-out. Every configured channel is attempted in parallel; each one owns its
// own timeout, so the whole dispatch finishes within one channel budget rather
// than the sum. One channel failing never stops another — the watch reports
// "delivered" if *any* pipe to Hermes accepted the capture.

const SENDERS: Record<Channel, (msg: OutboundMessage) => Promise<DeliveryResult>> = {
  TELEGRAM: sendTelegram,
  WEBHOOK: sendWebhook,
  SMS: sendSms,
  EMAIL: sendEmail,
};

export type DispatchOutcome = {
  results: DeliveryResult[];
  status: 'DELIVERED' | 'PARTIAL' | 'FAILED';
};

export async function dispatch(msg: OutboundMessage, channels = enabledChannels()): Promise<DispatchOutcome> {
  if (channels.length === 0) {
    return { results: [], status: 'FAILED' };
  }

  const results = await Promise.all(
    channels.map(async (channel): Promise<DeliveryResult> => {
      try {
        return await SENDERS[channel](msg);
      } catch (err) {
        // A sender should return, not throw — but a bug in one channel must not
        // take down the capture.
        return {
          channel,
          status: 'FAILED',
          detail: err instanceof Error ? err.message : 'sender threw',
        };
      }
    }),
  );

  const attempted = results.filter((r) => r.status !== 'SKIPPED');
  const sent = attempted.filter((r) => r.status === 'SENT');

  let status: DispatchOutcome['status'];
  if (sent.length === 0) status = 'FAILED';
  else if (sent.length === attempted.length) status = 'DELIVERED';
  else status = 'PARTIAL';

  return { results, status };
}
