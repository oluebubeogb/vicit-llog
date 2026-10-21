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

