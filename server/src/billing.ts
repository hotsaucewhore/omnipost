import crypto from 'crypto';
import { BillingInterval, PlanTierId } from '../../shared/platforms';

export function isStripeLiveConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function resolveStripePriceId(
  tier: Exclude<PlanTierId, 'free'>,
  interval: BillingInterval
): string | undefined {
  if (tier === 'creator') {
    return interval === 'annual'
      ? process.env.STRIPE_CREATOR_ANNUAL_PRICE_ID ||
          process.env.STRIPE_CREATOR_MONTHLY_PRICE_ID
      : process.env.STRIPE_CREATOR_MONTHLY_PRICE_ID;
  }
  return interval === 'annual'
    ? process.env.STRIPE_STUDIO_ANNUAL_PRICE_ID ||
        process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID
    : process.env.STRIPE_STUDIO_MONTHLY_PRICE_ID;
}

export async function createStripeCheckoutSession(params: {
  userId: string;
  userEmail: string;
  planTier: Exclude<PlanTierId, 'free'>;
  billingInterval: BillingInterval;
  returnServerBaseUrl: string;
  clientAppUrl: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set.');
  }

  const configuredPriceId = resolveStripePriceId(
    params.planTier,
    params.billingInterval
  );

  const unitAmountCents =
    params.planTier === 'creator'
      ? params.billingInterval === 'annual'
        ? 12000 // $10/mo * 12 billed annually
        : 1200 // $12/mo
      : params.billingInterval === 'annual'
      ? 28800 // $24/mo * 12 billed annually
      : 2900; // $29/mo

  const successUrl = `${params.returnServerBaseUrl}/api/billing/stripe-return?session_id={CHECKOUT_SESSION_ID}&app_url=${encodeURIComponent(
    params.clientAppUrl
  )}`;
  const cancelUrl = `${params.clientAppUrl}`;

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('customer_email', params.userEmail);
  form.set('success_url', successUrl);
  form.set('cancel_url', cancelUrl);
  form.set('metadata[userId]', params.userId);
  form.set('metadata[planTier]', params.planTier);
  form.set('metadata[billingInterval]', params.billingInterval);
  form.set('subscription_data[metadata][userId]', params.userId);
  form.set('subscription_data[metadata][planTier]', params.planTier);
  form.set(
    'subscription_data[metadata][billingInterval]',
    params.billingInterval
  );

  if (configuredPriceId) {
    form.set('line_items[0][price]', configuredPriceId);
    form.set('line_items[0][quantity]', '1');
  } else {
    form.set('line_items[0][quantity]', '1');
    form.set('line_items[0][price_data][currency]', 'usd');
    form.set(
      'line_items[0][price_data][unit_amount]',
      String(unitAmountCents)
    );
    form.set(
      'line_items[0][price_data][recurring][interval]',
      params.billingInterval === 'annual' ? 'year' : 'month'
    );
    form.set(
      'line_items[0][price_data][product_data][name]',
      `OmniPost ${params.planTier === 'studio' ? 'Studio' : 'Creator'} (${
        params.billingInterval
      })`
    );
    // Cloud SaaS product tax code for Stripe Managed Payments / Stripe Tax compatibility
    form.set(
      'line_items[0][price_data][product_data][tax_code]',
      'txcd_10103001'
    );
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const json: any = await res.json();
  if (!res.ok || !json.url) {
    throw new Error(
      json?.error?.message || 'Failed to create Stripe Checkout session'
    );
  }

  return {
    checkoutUrl: json.url,
    sessionId: json.id,
  };
}

export async function verifyStripeCheckoutSession(sessionId: string): Promise<{
  paid: boolean;
  userId?: string;
  planTier?: PlanTierId;
  billingInterval?: BillingInterval;
  customerId?: string;
}> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { paid: false };

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(
      sessionId
    )}`,
    {
      headers: { Authorization: `Bearer ${secretKey}` },
    }
  );
  const json: any = await res.json();
  if (!res.ok) return { paid: false };

  const paid =
    json.payment_status === 'paid' || json.status === 'complete';
  const rawTier = json?.metadata?.planTier as PlanTierId | undefined;
  const rawInterval = json?.metadata?.billingInterval as
    | BillingInterval
    | undefined;

  return {
    paid,
    userId: json?.metadata?.userId,
    planTier:
      rawTier === 'creator' || rawTier === 'studio' ? rawTier : undefined,
    billingInterval:
      rawInterval === 'annual' || rawInterval === 'monthly'
        ? rawInterval
        : 'monthly',
    customerId:
      typeof json.customer === 'string' ? json.customer : undefined,
  };
}

/**
 * Verifies Stripe's `Stripe-Signature: t=...,v1=...` HMAC-SHA256 header
 * against the raw webhook request body.
 */
export function verifyStripeWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  webhookSecret: string,
  toleranceSec = 300
): boolean {
  if (!signatureHeader || !webhookSecret) return false;
  const payloadStr = Buffer.isBuffer(rawBody)
    ? rawBody.toString('utf8')
    : String(rawBody);

  let timestamp = '';
  const signatures: string[] = [];
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.trim().split('=');
    if (k === 't' && v) timestamp = v;
    if (k === 'v1' && v) signatures.push(v);
  }

  if (!timestamp || signatures.length === 0) return false;
  const tsNum = Number(timestamp);
  if (!Number.isFinite(tsNum)) return false;

  const ageSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
  if (ageSec > toleranceSec) return false;

  const signedPayload = `${timestamp}.${payloadStr}`;
  const expectedHex = crypto
    .createHmac('sha256', webhookSecret)
    .update(signedPayload, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  return signatures.some((sig) => {
    try {
      const candidateBuf = Buffer.from(sig, 'hex');
      if (candidateBuf.length !== expectedBuf.length) return false;
      return crypto.timingSafeEqual(candidateBuf, expectedBuf);
    } catch {
      return false;
    }
  });
}

export function signTestStripeWebhookPayload(
  payloadStr: string,
  webhookSecret: string,
  timestampSec = Math.floor(Date.now() / 1000)
): string {
  const v1 = crypto
    .createHmac('sha256', webhookSecret)
    .update(`${timestampSec}.${payloadStr}`, 'utf8')
    .digest('hex');
  return `t=${timestampSec},v1=${v1}`;
}
