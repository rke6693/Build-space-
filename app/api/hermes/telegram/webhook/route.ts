import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { telegramConfig } from '@/lib/hermes/config';
import { logger } from '@/lib/logger';
import { limiters } from '@/lib/ratelimit';

// Inbound half of the Telegram channel: whatever Hermes replies in the chat
// lands here and becomes a message in the watch inbox.
//
// Telegram authenticates webhooks with a secret token header that you set when
// registering the webhook URL:
//
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//     -d url="https://<host>/api/hermes/telegram/webhook" \
//     -d secret_token="$HERMES_TELEGRAM_WEBHOOK_SECRET"

type TelegramUpdate = {
  update_id?: number;
  message?: { message_id?: number; chat?: { id?: number | string }; text?: string; from?: { is_bot?: boolean } };
  edited_message?: { chat?: { id?: number | string }; text?: string };
};

export async function POST(req: Request) {
  const cfg = telegramConfig();
  if (!cfg) return NextResponse.json({ ok: false }, { status: 404 });

  // Without a configured secret we cannot tell Telegram from anyone else who
  // found the URL, so refuse rather than trust the payload.
  if (!cfg.webhookSecret) {
    logger.warn('telegram webhook hit but HERMES_TELEGRAM_WEBHOOK_SECRET is unset');
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const presented = req.headers.get('x-telegram-bot-api-secret-token') ?? '';
  const expected = cfg.webhookSecret;
  if (
    presented.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
  ) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const rl = await limiters.webhook.limit('hermes:telegram');
  if (!rl.success) return NextResponse.json({ ok: false }, { status: 429 });

  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  const message = update?.message ?? update?.edited_message;
  const text = message?.text?.trim();
  const chatId = message?.chat?.id;

  // Only accept traffic from the one chat this relay is bound to.
  if (!text || String(chatId ?? '') !== String(cfg.chatId)) {
    return NextResponse.json({ ok: true }); // ack so Telegram stops retrying
  }

  // Which user owns this chat? The bot token and chat id are global
  // configuration, so this channel is single-tenant by construction: one bot,
  // one chat, one person's agent. Attribute replies to the most recently active
  // device. `nulls: 'last'` matters — Postgres sorts NULLs first on DESC, so
  // without it a device that has never checked in would outrank a live one.
  //
  // If this ever needs to serve several users, the chat id has to move onto the
  // user record and be looked up here instead.
  const owner = await db.hermesDevice.findFirst({
    where: { revokedAt: null, lastSeenAt: { not: null } },
    orderBy: { lastSeenAt: { sort: 'desc', nulls: 'last' } },
    select: { userId: true },
  });
  if (!owner) return NextResponse.json({ ok: true });

  const externalId =
    update?.update_id != null ? `tg:${cfg.chatId}:${update.update_id}` : undefined;

  try {
    await db.hermesMessage.create({
      data: {
        userId: owner.userId,
        channel: 'TELEGRAM',
        body: text.slice(0, 4000),
        externalId,
      },
    });
  } catch {
    // Unique violation on externalId — Telegram redelivered an update we already
    // stored. Acking is the correct response.
  }

  return NextResponse.json({ ok: true });
}
