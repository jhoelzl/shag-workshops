# Plan: Collegiate Shag Workshops Salzburg — Website

**TL;DR**: Statische Website (Astro + React + Tailwind) auf GitHub Pages mit Supabase als Backend (DB, Auth, Edge Functions). Nutzer registrieren sich für Tanzkurse ohne Account; Admin verwaltet Kurse und bestätigt Anmeldungen. E-Mails via Resend. Zweisprachig (DE/EN). CI/CD via GitHub Actions.

---

## Phase 1: Projekt-Setup & Infrastruktur

### Step 1 — Astro-Projekt initialisieren
- Astro mit React-Integration + Tailwind CSS, Static Output für GitHub Pages
- Ordnerstruktur:
  ```
  /src
    /components      — React-Komponenten
    /layouts          — Astro-Layouts
    /pages
      /de             — Deutsche Seiten
      /en             — Englische Seiten
    /lib              — Supabase Client, Helpers
    /i18n             — Übersetzungs-Dateien
  /supabase
    /migrations       — SQL-Migrationen
    /functions        — Edge Functions
  ```
- Astro i18n Routing (`/de/...`, `/en/...`, Default-Redirect auf `/de`)

### Step 2 — Supabase Projekt konfigurieren *(parallel mit Step 1)*
- Supabase-Projekt im Dashboard erstellen
- `.env.local` für `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- Supabase CLI für lokale Entwicklung (`supabase init`, `supabase start` via Docker)

### Step 3 — GitHub Repo + CI/CD *(parallel mit Step 1)*
- GitHub Actions Workflow: Push auf `main` → `astro build` → Deploy auf GitHub Pages
- Supabase Credentials als GitHub Secrets

---

## Phase 2: Supabase Datenbank-Design

### Step 4 — Tabelle `dance_classes`

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | uuid PK | Auto-generiert |
| `title_de` / `title_en` | text | Kursname zweisprachig |
| `description_de` / `description_en` | text | Beschreibung zweisprachig |
| `level` | text | z.B. "Beginner", "Intermediate" |
| `start_date` / `end_date` | date | Erster/letzter Termin |
| `day_of_week` | smallint | 0=So ... 6=Sa |
| `time_start` / `time_end` | time | Uhrzeit |
| `session_count` | smallint | Anzahl Termine (4-6) |
| `location` | text | Ort/Adresse |
| `max_leads` / `max_follows` | smallint | Kapazität pro Rolle |
| `price_eur` | numeric(6,2) | Preis |
| `registration_open` | boolean | Registrierung möglich? |
| `created_at` / `updated_at` | timestamptz | Timestamps |

### Step 5 — Tabelle `registrations`

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | uuid PK | Auto-generiert |
| `dance_class_id` | uuid FK → dance_classes | Kurs-Referenz |
| `email` | text | Teilnehmer-E-Mail |
| `name` | text | Teilnehmer-Name |
| `role` | text CHECK ('lead','follow') | Tanzrolle |
| `partner_name` | text (nullable) | Optionaler Partner |
| `status` | text CHECK ('pending','confirmed','waitlisted','cancelled') | Default: 'pending' |
| `admin_notes` | text | Interne Notizen |
| `created_at` | timestamptz | |

- **UNIQUE Constraint** auf `(dance_class_id, email)` — keine Doppelregistrierung

### Step 6 — Row Level Security (RLS)
- `dance_classes` SELECT: öffentlich (wo `registration_open = true`)
- `dance_classes` INSERT/UPDATE/DELETE: nur Admin
- `registrations`: kein direkter Client-Zugriff, INSERT via Edge Function, SELECT/UPDATE/DELETE nur Admin

### Step 7 — SQL-Migrationen
- Datei unter `/supabase/migrations/001_create_tables.sql`
- DB Trigger: `updated_at` automatisch setzen bei UPDATE auf `dance_classes`

---

## Phase 3: Backend (Edge Functions)

### Step 8 — Edge Function `register`
- `POST /functions/v1/register`
- Validiert Input → prüft Kapazität (auto-Waitlist wenn voll) → prüft Duplikate → INSERT → E-Mail via Resend
- E-Mail: "Deine Registrierung ist eingegangen, Bestätigung durch den Veranstalter steht aus"
- Env-Variablen: `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

### Step 9 — Edge Function `confirm-registration` *(depends on Step 8)*
- `POST /functions/v1/confirm-registration` — nur für authentifizierten Admin
- Ändert Status → sendet E-Mail (Bestätigung / Warteliste / Absage)

### Step 10 — Resend einrichten *(parallel mit Steps 8-9)*
- Account bei resend.com + API Key
- E-Mail Templates (DE/EN): Registrierung eingegangen, Bestätigt, Warteliste, Abgesagt

---

## Phase 4: Frontend — Öffentliche Seiten

### Step 11 — Layout & Navigation
- Responsive (Mobile-first), Header mit "Collegiate Shag Salzburg" + Sprachumschalter (DE/EN), Footer

### Step 12 — Homepage (`/de/`, `/en/`)
- Hero-Bereich, aktuelle Workshops (client-side aus Supabase geladen), CTA "Jetzt anmelden"

### Step 13 — Workshops & Registrierung (`/de/workshops/`, `/en/workshops/`)
- Kursliste mit freien Plätzen (Leads/Follows Zähler)
- Registrierungsformular (React): Kurs wählen → Rolle → Name → E-Mail → Partner (optional) → Submit → Edge Function
- Erfolgs-/Fehlermeldung inline

---

## Phase 5: Frontend — Admin-Bereich

### Step 14 — Admin Login (`/admin/login`)
- Supabase Auth `signInWithPassword()`

### Step 15 — Admin Dashboard (`/admin/`) *(depends on Step 14)*
- Geschützt via Auth-Check, Übersicht aller Kurse mit Statistik

### Step 16 — Kurse verwalten (`/admin/classes`) *(depends on Step 15)*
- CRUD Formular für Kurse

### Step 17 — Registrierungen verwalten (`/admin/registrations`) *(depends on Step 15)*
- Tabelle mit Filter nach Kurs, Leads/Follows-Counter
- Aktionen: Bestätigen / Warteliste / Absagen (→ Edge Function → E-Mail)
- Bulk-Aktionen möglich

---

## Phase 6: Lokale Entwicklung & Deployment

### Step 18 — Lokale Dev-Umgebung
- `supabase start` (Docker) + `npm run dev` + `supabase functions serve`
- `.env.local` für lokale Credentials, `.env.example` dokumentiert

### Step 19 — Deployment Flow
- Push `main` → GitHub Actions → Build → GitHub Pages
- Edge Functions: `supabase functions deploy` (manuell oder separate CI-Step)
- Migrationen: `supabase db push`

---

## Verification

1. Lokal: `supabase start` + `npm run dev` → Registrierung gegen lokale DB testen
2. Registrierung E2E: Formular → DB-Eintrag → E-Mail empfangen
3. Admin E2E: Login → Kurs erstellen → Registrierungen verwalten → Bestätigungs-E-Mail
4. RLS: Unauthentifizierter Zugriff auf Admin-Endpunkte wird korrekt abgelehnt
5. Build: `npm run build` erzeugt korrektes statisches Output
6. Deploy: GitHub Actions → Seite erreichbar unter `jhoelzl.github.io/shag-workshops`
7. Responsive: Desktop + Mobile prüfen
8. i18n: Sprachwechsel funktioniert korrekt

---

## Entscheidungen

- **Client-side Fetching**: Supabase-Daten werden client-side via React geladen (GitHub Pages = kein SSR), Kursverfügbarkeit ist damit immer live
- **Edge Functions als API-Layer**: Kein direkter DB-Insert vom Client → serverseitige Validierung, E-Mail-Versand, keine Service-Keys im Client
- **Kein User-Account**: Nur E-Mail-basierte Registrierung, kein Login für Teilnehmer
- **Single Admin**: Kein Rollen-System, Admin-Check via `auth.uid()`
- **Spätere Seiten** (Archiv, About Collegiate Shag, etc.) → einfache Astro-Seiten, jederzeit ergänzbar

---

## Offene Überlegungen

1. **Resend Free Tier** sendet von `onboarding@resend.dev` — für Produktion sollte eine eigene Domain verifiziert werden
2. **Zahlung** ist aktuell nicht enthalten (nur Preis-Anzeige). Stripe-Integration wäre eine spätere Phase
3. **Supabase Free Tier** reicht für den Start (500 MB DB, 50k Auth-Requests, Edge Functions)
