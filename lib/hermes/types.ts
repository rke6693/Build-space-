import type { Channel } from './config';
import type { Classification } from './intent';

export type DeliveryStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export type DeliveryResult = {
  channel: Channel;
  status: DeliveryStatus;
  detail?: string;
  latencyMs?: number;
};

/** One capture, rendered once per wire format so each channel just ships bytes. */
export type OutboundMessage = {
  captureId: string;
  /** Plain text — SMS, email body, webhook `text`. */
  plain: string;
  /** Telegram MarkdownV2, already escaped. */
  markdown: string;
  /** Subject line for email. */
  subject: string;
  /** Machine-readable form for the webhook and for the agent to act on. */
  structured: {
    capture_id: string;
    intent: Classification['intent'];
    title: string;
    list_name?: string;
    due_at?: string;
    transcript: string;
    captured_at: string;
    confidence: number;
    classifier: Classification['classifier'];
    device: { id: string; name: string; platform: string };
    time_zone?: string;
  };
};
