# Vicit Llog – Phase 1 + Phase 2

**Premium Visitor Access \& Exit Control Platform**

Mobile-first PWA for organisation visitor management.

## Quick Start (Docker)

```bash
cp .env.example .env
docker compose up -d --build
```

* Frontend: http://localhost:3000
* Backend API: http://localhost:4000
* Swagger: http://localhost:4000/api

Default admin: `admin@vicit.local` / `Admin@12345`

## Phase 1 (Core)

* Organisation setup + staff onboarding + roles.
* Visitor invites (guests, purpose, mode of entry)
* 60-min secure link + revive
* Live passport photo → QR + passphrase
* Gate entry / exit capture
* Host notifications
* Offline visitor requests (admin approval)
* Admin dashboard + full audit trail
* Mobile-first PWA with bottom navigation
* Local photo storage on VPS

## Phase 2 (Premium)

* Advanced analytics dashboard (volumes, peak times, purpose breakdown)
* Configurable approval workflows
* Visitor history + blacklisting
* Multi-gate / multi-location support
* White-labelling (logo, colours, org branding)
* Richer notifications (in-app + optional push hooks)
* Printable visitor passes
* Exportable compliance reports (CSV)
* Photo retention / cleanup policies
* System health endpoint
* Role fine-tuning \& better UI polish

## Tech Stack

|Component|Choice|
|-|-|
|Frontend|Next.js 14 + TS + Tailwind + PWA|
|Backend|NestJS + Prisma|
|Database|PostgreSQL 16|
|Auth|JWT + RBAC|
|Storage|VPS local filesystem|
|Deploy|Docker Compose|

## Roles

* **ADMIN** – Full control, analytics, blacklists, gates, branding
* **STAFF** – Create invites, view own visitors
* **GATE** – Scan / verify entry \& exit only

## Project Structure

```
vicit-llog/
├── frontend/          # Next.js PWA
├── backend/           # NestJS API
├── data/photos/       # Local photo storage
├── data/reports/      # Generated reports
├── docker-compose.yml
├── .env.example
└── README.md
```


## Gate QR scanning (iPhone / Android / desktop)

* The gate scanner works on iOS Safari, iOS home-screen (PWA) mode (iOS 13.4+), Android Chrome,
  Firefox and desktop browsers. It uses the native `BarcodeDetector` where available and falls
  back to a pure-JS decoder (jsQR) elsewhere — notably on every iPhone/iPad.
* **Live camera requires HTTPS** (browsers block the camera on `http://` except `localhost`).
  Serve the frontend over HTTPS in production, or officers can only use "Scan from photo" and
  passphrase entry.
* Fallbacks on the gate page: *Scan from photo* (take or choose a picture) and manual passphrase
  entry. The gate accepts the QR JSON, a `/visitor/<token>` link, a bare token/visitor id, or the
  passphrase in any case / spacing.
* QR codes are generated with error-correction M, a 4-module quiet zone, 512 px, black on opaque
  white (`backend/src/common/utils/qr.ts`). Visitor emails embed the QR as a CID inline PNG plus
  links to the registration page and a hosted PNG (`GET /visitors/qr/:token/:visitorId.png`; set
  `API_PUBLIC_URL`).
* Round-trip test (no DB needed): `cd backend && npm run test:qr`
