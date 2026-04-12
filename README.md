# Collegiate Shag Workshops Salzburg

Website for managing Collegiate Shag dance workshops in Salzburg.

**Stack**: Astro + React + Tailwind CSS + Supabase + GitHub Pages

## Features

- Bilingual (DE/EN) public website with workshop listings
- Registration form (no user account needed)
- Admin dashboard for managing classes and registrations
- Confirmation emails via Resend
- Auto-deploy to GitHub Pages on push

## Getting Started

### Prerequisites

- Node.js 22+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
- Docker (for local Supabase)

### Setup

```bash
# Install dependencies
npm install

# Copy env file and configure
cp .env.example .env.local
# Edit .env.local with your Supabase credentials

# Start local Supabase (requires Docker)
supabase start

# Apply database migrations
supabase db push

# Start dev server
npm run dev
```

### Local Supabase

When running `supabase start`, use the local credentials output:
```
PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
```

### Edge Functions (local)

```bash
supabase functions serve
```

Required edge function env vars (set in `supabase/.env`):
- `RESEND_API_KEY` — API key from [resend.com](https://resend.com)
- `EMAIL_FROM` — Sender address (e.g., `Shag Salzburg <noreply@yourdomain.com>`)

## Deployment

### GitHub Pages (Frontend)

Automatic via GitHub Actions on push to `main`.

Set these **GitHub Secrets**:
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`

### Supabase (Backend)

```bash
# Deploy edge functions
supabase functions deploy register
supabase functions deploy confirm-registration

# Push database migrations
supabase db push
```

Set edge function secrets:
```bash
supabase secrets set RESEND_API_KEY=your-key
supabase secrets set EMAIL_FROM='Shag Salzburg <noreply@yourdomain.com>'
```

### Create Admin User

In Supabase Dashboard → Authentication → Users → Add User (email + password).

## Project Structure

```
src/
  components/           React components
    admin/              Admin dashboard components
  i18n/                 Translations (de.json, en.json)
  layouts/              Astro layouts
  lib/                  Supabase client, types
  pages/
    de/                 German pages
    en/                 English pages
    admin/              Admin pages
  styles/               Global CSS
supabase/
  functions/            Edge functions (register, confirm-registration)
  migrations/           SQL migrations
.github/workflows/      CI/CD
```
