import { fetchWithTimeout, telegramConfig } from '../config';
import type { DeliveryResult, OutboundMessage } from '../types';

// Telegram is the preferred Hermes channel: instant, free, two-way, and it
// renders the structured capture nicely with a little Markdown.
export async function sendTelegram(msg: OutboundMessage): Promise<DeliveryResult> {
  const cfg = telegramConfig();
  if (!cfg) return { channel: 'TELEGRAM', status: 'SKIPPED', detail: 'not configured' };

  const started = Date.now();
  try {
    const res = await fetchWithTimeout(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: cfg.chatId,
        text: msg.markdown,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return {
        channel: 'TELEGRAM',
        status: 'FAILED',
        detail: `http ${res.status}: ${body.slice(0, 200)}`,
        latencyMs,
      };
    }
    return { channel: 'TELEGRAM', status: 'SENT', latencyMs };
  } catch (err) {
    return {
      channel: 'TELEGRAM',
      status: 'FAILED',
      detail: err instanceof Error ? err.message : 'network error',
      latencyMs: Date.now() - started,
    };
  }
}

/** Telegram's MarkdownV2 requires every one of these escaped, everywhere. */
export function escapeMarkdownV2(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}
