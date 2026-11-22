# OmniPost

Mobile-first cross-platform video publishing studio (**iOS, Android & Web** via Expo + **Node.js Single-Upload Relay Server**).

Upload a video **once**, customize hooks/titles/thumbnails per app if needed, verify `9:16` safe zones & platform limits, and publish simultaneously to:
- **TikTok** (Content Posting API v2)
- **Instagram Reels** (Instagram Graph API resumable container)
- **YouTube Shorts** (YouTube Data API v3 + auto `#Shorts` indexing)
- **YouTube Long-Form** (YouTube Data API v3 + custom `16:9` thumbnails & tags)
- **Facebook Video & Reels** (Meta Graph API Page Video & Reels)

---

## Quick Start

### 1. Start the Upload Relay & OAuth Server (Port `4000`)
```powershell
cd server
npm run dev
```

### 2. Start the Mobile App (Expo Go for iOS/Android + Web Preview)
In a second terminal:
```powershell
cd mobile
npm run start
```
- **On your phone (iOS / Android):** Scan the QR code in the terminal using **Expo Go** (make sure your phone and PC are on the same Wi-Fi network).
- **In your desktop browser:** Press `w` in the Expo terminal (or run `npm run web`).

---

## Switching from Sandbox Mode to Live Direct OAuth

Out of the box, all 4 account groups (`TikTok`, `Instagram`, `YouTube`, `Facebook`) run in **Sandbox Simulator Mode** so you can test multi-platform fan-out, rule validation, and single-platform failure recovery immediately.

To connect real live accounts:
1. Copy `server/.env.example` to `server/.env`.
2. Fill in the OAuth credentials for any provider you want to enable:
   - `TIKTOK_CLIENT_KEY` & `TIKTOK_CLIENT_SECRET`
   - `META_APP_ID` & `META_APP_SECRET`
   - `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`
3. Restart `server` and tap **Connect Live** in the **Accounts** tab.
