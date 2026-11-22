# OmniPost Production Cloud Launch & OAuth Rollout Guide

OmniPost ships as a **single unified Docker container** (`Dockerfile`) serving both the compiled Expo Web app (`/app/mobile/dist`) and the Express + FFmpeg + SQLite WAL backend on one HTTPS domain—plus ready-to-deploy blueprints for **Railway** (`railway.json`), **Fly.io** (`fly.toml`), **Render** (`render.yaml`), and **Docker Compose** (`docker-compose.yml`).

> **In-App Live Diagnostics:** Open **Accounts -> Launch & OAuth checklist** inside OmniPost anytime to verify live environment keys and copy your exact Stripe Webhook, Privacy/Terms, and OAuth Redirect URIs in one click.

---

## 1. One-Command Cloud Deployment (Pick Any Host)

### Option A: Railway (`railway.json`)
1. Push this repo to GitHub and click **New Project -> Deploy from GitHub repo** in Railway.
2. Add a **Volume** mounted to `/app/server/data` (persists `omnipost.sqlite` in WAL mode).
3. Set `PUBLIC_SERVER_URL=https://yourdomain.com` and `PUBLIC_WEB_URL=https://yourdomain.com` in Variables.

### Option B: Fly.io (`fly.toml`)
```bash
fly volumes create omnipost_data --region iad --size 10
fly secrets set PUBLIC_SERVER_URL=https://omnipost-studio.fly.dev PUBLIC_WEB_URL=https://omnipost-studio.fly.dev
fly deploy
```

### Option C: Render Blueprint (`render.yaml`) or VPS (`docker-compose.yml`)
- **Render:** Click **New -> Blueprint** and select this repository (`render.yaml` automatically provisions the 10GB SQLite persistent disk and `/api/health` check).
- **VPS:** Copy `server/.env.example` to `server/.env` and run `docker compose up -d --build`.

---

## 2. Activate Live Stripe Subscriptions ($12 Creator / $29 Studio)
1. Create two recurring products in Stripe Dashboard (`Creator` `$12/mo` · `$120/yr` and `Studio` `$29/mo` · `$288/yr`).
2. Add `STRIPE_SECRET_KEY=sk_live_...` and the optional Price IDs from `server/.env.example`.
3. Create a Stripe Webhook pointing to `https://yourdomain.com/api/billing/webhook` for events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Set `STRIPE_WEBHOOK_SECRET=whsec_...` (verified via HMAC-SHA256 in `server/src/billing.ts`).

---

## 3. Submit OAuth Apps (Fastest -> Longest Approval Order)

All OAuth review compliance pages are already live at `/privacy`, `/terms`, and `POST /api/compliance/meta-data-deletion`:

1. **Bluesky (Live Immediately — 0 Wait):** Users connect directly in **Accounts -> Connect live** using a Bluesky App Password (`bsky.app/settings/app-passwords`).
2. **YouTube Shorts & Long-form (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`):** Enable *YouTube Data API v3*, add redirect URI `https://yourdomain.com/api/oauth/youtube/callback`. Privacy page already includes the required *Google API Services User Data Policy (Limited Use)* disclosure.
3. **LinkedIn (`LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`):** Enable *Share on LinkedIn* + *Sign In with LinkedIn using OpenID Connect*, redirect URI `https://yourdomain.com/api/oauth/linkedin/callback` (typically approved in <24h).
4. **X (`X_CLIENT_ID` / `X_CLIENT_SECRET`):** Enable OAuth 2.0 User Auth (`tweet.read`, `tweet.write`, `users.read`, `offline.access`), redirect URI `https://yourdomain.com/api/oauth/x/callback`.
5. **Threads, Instagram & Facebook (`META_APP_ID` / `THREADS_APP_ID`):** Point Privacy Policy to `/privacy`, Terms to `/terms`, and User Data Deletion Callback to `https://yourdomain.com/api/compliance/meta-data-deletion`.
6. **TikTok (`TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET`):** Enable *Login Kit* + *Content Posting API (Direct Post)*, redirect URI `https://yourdomain.com/api/oauth/tiktok/callback`, and attach a 60-second screen recording of the OmniPost composer + per-platform preview.

---

## 4. iOS & Android Native App Store Builds (`mobile/`)
```bash
cd mobile
EXPO_PUBLIC_API_URL=https://yourdomain.com npx eas build --platform all
```
