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
* Richer notifications (in-app + Web Push)
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

## Design system & branding

- **Branding & Settings** (Admin → Branding) drive the whole product: organisation name and logo
  (navigation, login, splash, visitor pages, emails, PWA manifest, document title), primary /
  secondary colours (generated into a full 50–950 shade scale used by every page, chart and email,
  plus the PWA theme colour), email logo background, custom domain (invite and QR links), approval
  requirement (staff invites wait in *Awaiting approval*) and photo retention.
- The PWA manifest is served dynamically from `/manifest.webmanifest` using the saved branding
  (`API_INTERNAL_URL` lets the Next.js server reach the API inside Docker).
- iOS launch images are static PNGs. Regenerate them in your brand colours with:

  ```bash
  cd frontend && node scripts/generate-pwa-assets.mjs "#2563eb" "#1e40af"
  ```

- UI building blocks live in `frontend/src/components/ui` (Tooltip/InfoTip, Sheet, StatusPill,
  Avatar, Sparkline, Collapse, PageHeader, Bits). Explanatory copy is shown in tooltips; errors and
  essential information are always shown inline. Animations respect `prefers-reduced-motion`.

## Push notifications (Web Push / VAPID)

Every in-app notification, including a gate/host ring, is also sent with the Web Push protocol
to each browser or installed PWA the user has allowed. This does not use Firebase.

Generate a key pair once and keep it:

```bash
npx web-push generate-vapid-keys
```

| Variable | Where | Notes |
|-|-|-|
| `ENABLE_PUSH` | Backend | `true` to send. `false` turns delivery off. |
| `VAPID_PUBLIC_KEY` | Backend | Public key from the command above. The browser reads it from `GET /notifications/push-config`. |
| `VAPID_PRIVATE_KEY` | Backend | **Secret.** Never expose it to the frontend. |
| `VAPID_SUBJECT` | Backend | `mailto:you@yourorg.com` or an `https://` contact URL. |

If the keys are empty and push is not explicitly disabled, the API creates an ephemeral pair for
that process. Subscriptions from those keys stop working when the process restarts, so production
must set both keys.

Push needs a secure context (HTTPS, or localhost). Desktop Chrome, Edge, and Firefox deliver
pushes while the PWA is closed. Safari on macOS does too, once the user allows notifications.
On iPhone and iPad, Web Push works only after the user installs Vicit to the Home Screen
(iOS/iPadOS 16.4 or newer) and the site is served over HTTPS. A ring notification opens
`/ring?call=<id>`, which is the answer screen, with a `tel:` fallback when a phone number is on file.

`GET /notifications/push-status` reports whether the backend can send.


## Multi-agency platform upgrade

This build adds a multi-agency administration layer and ordered gate checkpoints. The environment-configured `ADMIN_EMAIL` account is bootstrapped as the **Super Admin** (the original environment organisation remains available as an agency/workspace for existing records). If you were already signed in before deploying, sign out and back in so the updated role is loaded. Keep `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ORGANIZATION`, and `ORGANIZATION_CODE` configured in Coolify; the seed synchronizes the Super Admin credentials from those values.

After deployment, sign in with the Super Admin account and open **Platform** from the bottom navigation. From there you can create agencies and their first Agency Admin, appoint delegated Super Admin IIs with explicit permissions, appoint Super Gate Officers, create agency Staff/Gate/Agency Admin accounts, and assign super gate officers to checkpoints across agencies. Agency Admins continue to use the existing Vicit workspace and can manage their own users, locations, gates, and agency data.

Run the new Prisma migration during deployment (`prisma migrate deploy` is already part of the backend entrypoint). Existing gates receive a stable initial sequence based on their creation time. Configure each agency's ordered checkpoints under **Locations & gates** and assign its gate officers. A gate officer must be assigned to a checkpoint before recording a checkpoint decision.

Checkpoint events are append-only records. A visitor must pass every earlier active checkpoint in the same destination location before a later checkpoint can pass them. A denial at a later checkpoint does not erase earlier passed events. Each checkpoint can record withheld and allowed particulars; withheld items are visually prioritized in the gate inspection UI. Optional evidence images are stored under `PHOTO_STORAGE_PATH/particulars`; they therefore use the existing persistent photo volume. Agency logos use `PHOTO_STORAGE_PATH/logos`.

**Deployment note:** this upgrade extends the existing database. Back up PostgreSQL and the current uploads volume before deploying the migration. Agency logos can be uploaded (or supplied as an HTTPS logo URL).
