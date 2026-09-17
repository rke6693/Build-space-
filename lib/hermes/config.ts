// ---------------------------------------------------------------------------
// Channel configuration.
//
// Every channel is optional and read lazily from the environment, so the relay
// adds zero required config to an existing deployment: set the vars for the
// channels you actually use and the rest report SKIPPED.
// ---------------------------------------------------------------------------

export type Channel = 'TELEGRAM' | 'SMS' | 'WEBHOOK' | 'EMAIL';

export type TelegramConfig = { botToken: string; chatId: string; webhookSecret?: string };
export type SmsConfig = { accountSid: string; authToken: string; from: string; to: string };
export type WebhookConfig = { url: string; secret?: string };
export type EmailConfig = { to: string; from: string; apiKey: string };

export function telegramConfig(): TelegramConfig | null {
  const botToken = process.env.HERMES_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.HERMES_TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) return null;
  return { botToken, chatId, webhookSecret: process.env.HERMES_TELEGRAM_WEBHOOK_SECRET };
}

export function smsConfig(): SmsConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  const to = process.env.HERMES_SMS_TO;
  if (!accountSid || !authToken || !from || !to) return null;
  return { accountSid, authToken, from, to };
}

export function webhookConfig(): WebhookConfig | null {
  const url = process.env.HERMES_WEBHOOK_URL;
  if (!url) return null;
  // Refuse anything but HTTPS: this payload carries the user's spoken words.
  try {
    if (new URL(url).protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { url, secret: process.env.HERMES_WEBHOOK_SECRET };
}

export function emailConfig(): EmailConfig | null {
  const to = process.env.HERMES_EMAIL_TO;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!to || !apiKey || !from) return null;
  return { to, from, apiKey };
}

/** Channels with complete configuration, in delivery-preference order. */
export function enabledChannels(): Channel[] {
  const out: Channel[] = [];
  if (telegramConfig()) out.push('TELEGRAM');
  if (webhookConfig()) out.push('WEBHOOK');
  if (smsConfig()) out.push('SMS');
  if (emailConfig()) out.push('EMAIL');
  return out;
}

/** Per-channel network budget. The watch is waiting; nothing here gets to hang. */
export const CHANNEL_TIMEOUT_MS = Number.parseInt(process.env.HERMES_CHANNEL_TIMEOUT_MS ?? '5000', 10);

export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = CHANNEL_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
