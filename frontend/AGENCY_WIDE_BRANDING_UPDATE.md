# Agency-wide authenticated branding

## What changed

- Authenticated agency users (`ADMIN`, `STAFF`, `GATE`) now load branding from the JWT-scoped `GET /branding` endpoint. The browser never supplies an organisation ID, so the API resolves the active user's own organisation.
- Agency name, logo, primary colour and secondary colour are applied through the existing global brand CSS-variable system. Existing components that use `brand-*` and `accent-*` utilities therefore update across dashboard, visitors, invitations, gate/checkpoint, staff, audit, reports, profile, settings and navigation without per-page hard-coded theme overrides.
- A compact identity strip now appears across authenticated pages, showing the active agency logo and name.
- Missing agency branding fields fall back independently to Vicit defaults; one missing field does not cause the entire brand to be replaced.
- `SUPER_ADMIN`, `GLOBAL_ADMIN` and `GLOBAL_GATE` retain Vicit platform identity rather than inheriting whichever agency is returned by the public branding endpoint.
- The branding cache is scoped by agency ID / platform / public identity. Auth changes clear the previous identity immediately, preventing one agency's cached logo or colours from flashing for another agency using the same browser.
- Login, logout, account changes and branding updates trigger a live refresh. Branding changes do not require a logout.
- Public login and visitor-facing pages continue to use the public branding endpoint.

## Deployment

No database migration or backend change is required. Deploy the updated frontend with the existing backend. The agency branding endpoint already exists and is protected by the authenticated user's organisation context.
