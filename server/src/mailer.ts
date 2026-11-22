import crypto from 'crypto';
import { EmailOutboxItem } from '../../shared/platforms';

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendTransactionalEmail(params: {
  toEmail: string;
  subject: string;
  category: EmailOutboxItem['category'];
  textBody: string;
  htmlBody?: string;
}): Promise<EmailOutboxItem> {
  const now = new Date().toISOString();
  const id = `eml_${Date.now().toString(36)}_${crypto
    .randomBytes(3)
    .toString('hex')}`;
  const resendKey = process.env.RESEND_API_KEY;
  const fromAddr =
    process.env.EMAIL_FROM || 'OmniPost Studio <notifications@omnipost.app>';

  let deliveryMode: EmailOutboxItem['deliveryMode'] = 'local_outbox';

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromAddr,
          to: [params.toEmail],
          subject: params.subject,
          text: params.textBody,
          html:
            params.htmlBody ||
            `<div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #181816; line-height: 1.6; max-width: 520px;">${params.textBody
              .split('\n')
              .map((line) => `<p style="margin: 0 0 12px;">${line}</p>`)
              .join('')}</div>`,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        deliveryMode = 'resend_live';
      }
    } catch {
      deliveryMode = 'local_outbox';
    }
  }

  return {
    id,
    toEmail: params.toEmail.trim().toLowerCase(),
    subject: params.subject,
    category: params.category,
    previewText: params.textBody.replace(/\s+/g, ' ').trim().slice(0, 180),
    deliveryMode,
    createdAt: now,
  };
}
