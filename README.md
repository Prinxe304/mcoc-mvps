# MCOC MVP Dashboard (Convex + Clerk)

Real-time shared War MVP dashboard with persistence across devices.

## 1) Install

```bash
npm install
```

## 2) Set env vars

Create `.env` from `.env.example`:

```env
VITE_ROOM_ID=global
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxx
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

## 3) Convex setup

```bash
npx convex dev
```

This will:
- Create/connect your Convex project
- Generate `convex/_generated/*`
- Push `convex/schema.ts` and functions

Set Clerk issuer domain in Convex env:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-clerk-domain.clerk.accounts.dev
```

## 4) Clerk setup

In Clerk dashboard:
- Create application
- Copy **Publishable key** to `VITE_CLERK_PUBLISHABLE_KEY`
- Create JWT template named `convex`

## 5) Run app

```bash
npm run dev
```

Open the same app URL on multiple devices, sign in, and updates sync in real time.
