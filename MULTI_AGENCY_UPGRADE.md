# Vicit multi-agency upgrade

## Roles

- **Super Admin** — environment-seeded deployment owner. Can create agencies, Global Admins and Global Gate Officers; appoint and suspend platform operators; create agency Staff, Gate Officers and Agency Admins; view cross-agency activity; assign Global Gate Officers to agency checkpoints.
- **Global Admin** — appointed only by the Super Admin. Has only the explicit platform permissions selected at appointment. Cannot appoint another Global Admin or change the Super Admin account.
- **Agency Admin** — retains the existing Vicit administrator experience and is restricted to their own agency's data.
- **Gate Officer** — belongs to one agency and can operate only checkpoints assigned within that agency.
- **Global Gate Officer** — can view cross-agency gate activity and operate only the checkpoints assigned to them.

## Platform screens

- `/platform` — agency creation, platform operator management, global gate officer assignments and agency staff/gate/admin onboarding.
- `/locations` — agency locations, ordered gates, and local gate-officer assignment.
- `/gate` — QR/passphrase lookup, checkpoint pass/deny, withheld/allowed particulars and optional image evidence.
- `/gate/visits` — agency-scoped or cross-agency visitor activity according to role and permissions.

## Checkpoint behavior

Gates are ordered within a Location. A visitor cannot pass a later active gate until each earlier active gate in that location has a `PASSED` event. Each event records the gate, officer, decision, timestamp, notes and particulars. `WITHHELD` particulars are displayed before `ALLOWED` particulars. Optional images are stored in `PHOTO_STORAGE_PATH/particulars`. The visitor's overall `ARRIVED` status is set only after the final active checkpoint passes. A later denial does not delete earlier checkpoint events.

## API additions

- `GET/POST /platform/agencies`
- `POST /platform/agencies/:agencyId/logo`
- `POST /platform/agencies/:agencyId/users`
- `GET /platform/people`, `GET /platform/audit`
- `GET /platform/administrators`, `POST /platform/administrators`
- `GET/POST /platform/global-gate-officers`
- `GET /platform/gates`, `POST /platform/gates/:gateId/global-officers/:userId`
- `PATCH /platform/administrators/:id/status`
- `GET /gate/checkpoints`, `POST /gate/checkpoint`, `GET /gate/history/:visitorId`
- `POST /gate/particular-image`
- `POST /locations/gates/:gateId/officers/:userId`, `PATCH /locations/gates/:gateId/order`

## Deployment

1. Back up PostgreSQL and the existing `PHOTO_STORAGE_PATH` volume.
2. Deploy the updated backend and frontend. The backend entrypoint runs `prisma migrate deploy` and the environment seed.
3. Keep the existing `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ORGANIZATION` and `ORGANIZATION_CODE` values. The environment admin is now seeded as `SUPER_ADMIN`.
4. Confirm `PHOTO_STORAGE_PATH` is a persistent volume. Agency logos are stored in `PHOTO_STORAGE_PATH/logos`; particulars images are stored in `PHOTO_STORAGE_PATH/particulars`.
5. Sign out and sign back in with the environment admin. Open **Platform** from the bottom navigation.
6. Create agencies and their first Agency Admins. Configure each agency's locations and ordered gates. Assign local Gate Officers in **Locations & gates**, and assign Global Gate Officers from **Platform → Global gate officers**.

The new migration backfills existing gate order using gate creation time. Existing organisations remain intact; the environment organisation is retained as the original workspace/agency so existing records are not discarded.
