import crypto from 'crypto';

const EDITORIAL_LEGAL_CSS = `
  body {
    margin: 0;
    padding: 40px 20px;
    background: #F5F4F0;
    color: #181816;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
  }
  .sheet {
    max-width: 760px;
    margin: 0 auto;
    background: #FFFFFF;
    border: 1px solid #E4E2DC;
    border-radius: 12px;
    padding: 32px;
  }
  h1 { font-size: 26px; letter-spacing: -0.5px; margin-top: 4px; }
  h2 { font-size: 17px; margin-top: 28px; padding-top: 20px; border-top: 1px solid #E4E2DC; }
  p, li { color: #524F48; font-size: 14.5px; }
  .eyebrow { font-size: 12px; font-weight: 600; color: #8A867C; }
  a { color: #181816; }
`;

export function renderPrivacyHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Policy & Data Deletion — OmniPost</title>
  <style>${EDITORIAL_LEGAL_CSS}</style>
</head>
<body>
  <main class="sheet">
    <div class="eyebrow">OmniPost · Effective November 2026</div>
    <h1>Privacy Policy & User Data Deletion</h1>
    <p>OmniPost is a user-directed cross-platform publishing studio. We access, store, and transmit only the media, text, and OAuth 2.0 / AT Protocol tokens needed to publish posts explicitly initiated or scheduled by the user.</p>

    <h2>1. OAuth Scopes & Platform Data</h2>
    <ul>
      <li><strong>YouTube Data API v3:</strong> <code>youtube.upload</code>, <code>youtube.readonly</code> — used exclusively to upload user-selected Shorts and long-form videos and display channel identity.</li>
      <li><strong>Instagram, Facebook & Threads (Meta):</strong> <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_manage_posts</code>, <code>threads_content_publish</code> — used to publish Reels, carousels, and text posts.</li>
      <li><strong>TikTok Content Posting API:</strong> <code>user.info.basic</code>, <code>video.publish</code> — used to publish user-initiated videos and photo carousels.</li>
      <li><strong>X, LinkedIn & Bluesky:</strong> used strictly to publish user-composed posts and optional first-comment replies.</li>
    </ul>

    <h2>2. Google API Services Limited Use Disclosure</h2>
    <p>OmniPost's use and transfer to any other app of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy">Google API Services User Data Policy</a>, including the Limited Use requirements. User data and uploaded media are never sold, never used for advertising, and never used to train AI/ML models.</p>

    <h2>3. Data Deletion Instructions</h2>
    <p>Users can disconnect any social account in one click inside <strong>Accounts → Disconnect</strong>, immediately erasing stored OAuth tokens, or delete their entire OmniPost account and workspaces. Meta automated data deletion requests are handled at <code>POST /api/compliance/meta-data-deletion</code>.</p>
  </main>
</body>
</html>`;
}

export function renderTermsHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Terms of Service — OmniPost</title>
  <style>${EDITORIAL_LEGAL_CSS}</style>
</head>
<body>
  <main class="sheet">
    <div class="eyebrow">OmniPost · Effective November 2026</div>
    <h1>Terms of Service</h1>
    <p>By using OmniPost, you agree to these plainspoken terms.</p>

    <h2>1. Content Ownership</h2>
    <p>You retain 100% ownership of all videos, photos, captions, and brand assets uploaded to OmniPost. You grant OmniPost only the technical right to transcode and transmit your content to the channels you select.</p>

    <h2>2. Upstream Platform Terms</h2>
    <p>When connecting channels, you also agree to abide by the <a href="https://www.youtube.com/t/terms">YouTube Terms of Service</a>, Meta Terms of Service, TikTok Terms of Service, X User Agreement, LinkedIn User Agreement, and Bluesky Social Terms of Service.</p>

    <h2>3. Subscriptions & Cancellation</h2>
    <p>Starter ($0) is free. Paid Creator ($12/mo) and Studio ($29/mo) subscriptions are billed via Stripe and can be canceled or downgraded anytime inside Plans & Billing.</p>
  </main>
</body>
</html>`;
}

export function buildMetaDataDeletionReceipt(baseUrl: string) {
  const confirmationCode = `del_${crypto.randomBytes(6).toString('hex')}`;
  return {
    url: `${baseUrl}/privacy#deletion-${confirmationCode}`,
    confirmation_code: confirmationCode,
  };
}
