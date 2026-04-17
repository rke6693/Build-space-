// Resend wrapper + HTML/text composition for the daily food-offers email.
// Pure functions for the templates so they're unit-testable without any network.

import { Resend } from 'resend';
import { env } from './env';
import type { Offer } from './food-offers';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDistance(meters?: number): string {
  if (meters == null) return '';
  const miles = meters / 1609.344;
  return ` · ${miles.toFixed(1)} mi`;
}

export function renderSubject(zip: string, dateLabel: string): string {
  return `Today's food picks near ${zip} — ${dateLabel}`;
}

export function renderHtml(params: {
  zip: string;
  dateLabel: string;
  offers: Offer[];
}): string {
  const { zip, dateLabel, offers } = params;

  const items = offers
    .map((o) => {
      const meta = [
        o.rating ? `${o.rating}★` : '',
        o.reviewCount ? `${o.reviewCount} reviews` : '',
        o.price ?? '',
        o.categories.join(', '),
      ]
        .filter(Boolean)
        .join(' · ');

      return `
        <li style="margin:0 0 16px 0;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;">
          <div style="font-size:16px;font-weight:600;">
            <a href="${escapeHtml(o.url)}" style="color:#111827;text-decoration:none;">${escapeHtml(o.name)}</a>
          </div>
          <div style="color:#374151;font-size:14px;margin-top:4px;">${escapeHtml(o.deal ?? '')}</div>
          <div style="color:#6b7280;font-size:12px;margin-top:4px;">
            ${escapeHtml(meta)}${escapeHtml(formatDistance(o.distanceMeters))}
          </div>
          ${o.address ? `<div style="color:#6b7280;font-size:12px;margin-top:2px;">${escapeHtml(o.address)}</div>` : ''}
        </li>`;
    })
    .join('\n');

  return `<!doctype html>
<html>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f9fafb;margin:0;padding:24px;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;">
      <h1 style="font-size:20px;margin:0 0 4px 0;">Today's food picks near ${escapeHtml(zip)}</h1>
      <p style="color:#6b7280;font-size:13px;margin:0 0 16px 0;">${escapeHtml(dateLabel)}</p>
      <ul style="list-style:none;padding:0;margin:0;">${items}</ul>
      <p style="color:#9ca3af;font-size:12px;margin-top:20px;">
        Curated from top-rated local spots. Reply to suggest changes to your daily picks.
      </p>
    </div>
  </body>
</html>`;
}

export function renderText(params: {
  zip: string;
  dateLabel: string;
  offers: Offer[];
}): string {
  const { zip, dateLabel, offers } = params;
  const lines = [
    `Today's food picks near ${zip} — ${dateLabel}`,
    '',
    ...offers.flatMap((o, i) => {
      const meta = [
        o.rating ? `${o.rating}★` : '',
        o.reviewCount ? `${o.reviewCount} reviews` : '',
        o.price ?? '',
        o.categories.join(', '),
      ]
        .filter(Boolean)
        .join(' · ');
      return [
        `${i + 1}. ${o.name}`,
        `   ${o.deal ?? ''}`,
        `   ${meta}${formatDistance(o.distanceMeters)}`,
        o.address ? `   ${o.address}` : '',
        `   ${o.url}`,
        '',
      ];
    }),
  ];
  return lines.filter((l) => l !== '').join('\n') + '\n';
}

export async function sendOffersEmail(params: {
  to: string;
  zip: string;
  dateLabel: string;
  offers: Offer[];
}): Promise<{ id: string | null }> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('RESEND_API_KEY and EMAIL_FROM must be set to send offers email');
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: params.to,
    subject: renderSubject(params.zip, params.dateLabel),
    html: renderHtml(params),
    text: renderText(params),
  });
  if (result.error) {
    throw new Error(`Resend error: ${result.error.message}`);
  }
  return { id: result.data?.id ?? null };
}
