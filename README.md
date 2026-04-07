# x402 Calendar — Paid Booking with USDC

A paid scheduling service: visitors pay $1 USDC (on Base) to book a 30-min slot on your Google Calendar.

## Architecture

```
Browser → picks slot → connects wallet → POST /api/book
                                              ↓
                                     x402 middleware checks payment
                                              ↓
                                     Google Calendar API creates event
                                              ↓
                                     Calendar invite sent to both parties
```

## Setup

### 1. Google Calendar API credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. **Enable** the "Google Calendar API"
4. Go to **Credentials → Create OAuth 2.0 Client ID** (type: Web application)
5. Add redirect URI: `http://localhost:4021/auth/callback`
6. Copy the Client ID and Client Secret

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:
- `GOOGLE_CLIENT_ID` — from step 1
- `GOOGLE_CLIENT_SECRET` — from step 1
- `GOOGLE_CALENDAR_ID` — `graham.romer.1@gmail.com`
- `WALLET_ADDRESS` — your MetaMask Base address (`0x...`)

### 3. Get Google refresh token (one time)

```bash
npm install
node scripts/get-token.js
```

Follow the prompts. Paste the resulting `GOOGLE_REFRESH_TOKEN` into `.env`.

### 4. Run locally (dev mode, no payment gate)

```bash
npm run dev
```

Open `http://localhost:4021` — you can test the full flow without crypto.

### 5. Enable x402 payments

```bash
npm install @x402/express @x402/core @x402/evm @x402/svm
```

Set `ENABLE_X402=true` in `.env` and restart. Now POST /api/book requires a $1 USDC payment on Base Sepolia.

### 6. Deploy to Vercel

```bash
vercel
```

Set env vars in Vercel dashboard and you're live.

## Endpoints

| Endpoint | Auth | Description |
|---|---|---|
| `GET /api/availability?date=YYYY-MM-DD` | None | Returns available 30-min slots |
| `POST /api/book` | x402 ($1 USDC) | Books a slot, creates calendar event |
| `GET /api/health` | None | Health check |

## Config

Open windows: **Mon-Fri 12:00 PM - 5:00 PM PT**

Edit `lib/calendar.js` → `OPEN_WINDOWS` to change.

## Roadmap

- **v2**: Add Stripe for fiat payments alongside crypto
- **v2**: Headless/agent mode for autonomous AI booking
- **v2**: Bazaar listing for x402 service discovery
