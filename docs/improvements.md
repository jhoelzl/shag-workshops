# Shagadeus — Gesamte Verbesserungsübersicht

Erstellt: 21. Mai 2026  
Aktualisiert: 25. September 2026  
Scope: Gesamte Website & Infrastruktur (`shagadeus.at`)  
Stack: Astro 7.3.3 · React 19.3.0 · Tailwind CSS v4.3 · Supabase Edge Functions · Resend · statisches Astro-Output

---

## Legende

| Aufwand | Bedeutung |
|---------|-----------|
| 🟢 Klein | < 1 Stunde |
| 🟡 Mittel | halber Tag |
| 🔴 Groß | 1–3 Tage |

---

## 1. Security

### 1.2 Rate-Limiting auf `/register` 🟡 ☐
IP-basiertes Rate-Limiting gegen Spam-Flooding ergänzen.  
→ Supabase Edge Functions können `Deno.env`-KV-Stores oder Upstash Redis nutzen:  
  max 5 Requests / IP / 10 Minuten (Sliding Window).  
→ Überschreitung → 429 mit Retry-After-Header.

### 1.4 E-Mail-MX-Validierung server-seitig 🟡 ☐
Nach Client-seitiger Regex in `register/index.ts` zusätzlich DNS-MX-Lookup:  
`fetch('https://cloudflare-dns.com/dns-query?name=<domain>&type=MX&ct=application/dns-json')`  
→ Keine Antwort / leeres Answer-Array → VALIDATION-Error zurück.  
→ Fängt `@gmial.com` und Wegwerf-Domains, die kein MX besitzen.


### 1.7 `Secure` + `HttpOnly` Session-Cookie prüfen 🟢 ☐
Supabase-JS setzt Session per `localStorage` (default). Auf Cookie-Modus umstellen (`auth.storage` = Cookie) damit die Session nicht per JS auslesbar ist:  
```ts
createClient(url, key, { auth: { flowType: 'pkce', storage: CookieStorage } })
```

---

## 2. Performance

### 2.1 Supabase-Abfragen im Client konsolidieren 🟡
`WorkshopPage.tsx` und `ClassList.tsx` feuern jeweils 3 separate Queries (dance_classes, sessions, counts).  
→ Einzelner RPC `get_classes_with_sessions_and_counts()` mit `LEFT JOIN` in Postgres.  
→ Reduziert Round-Trips von 3 auf 1, messbar bei mobilen Verbindungen.

### 2.3 Bilder mit `<Image>` aus `@astrojs/image` 🟡
Alle `<img>`-Tags im HTML nutzen keine automatische WebP-Konvertierung oder Lazy-Loading.  
→ `@astrojs/image` oder natives `<Image>` aus Astro 4+ nutzen.  
→ `loading="lazy"`, `decoding="async"`, automatische `srcset`-Generierung.

### 2.4 Font-Preload für Fraunces & Inter 🟢
Fraunces (Display) und Inter sind kritische Render-Blocking-Ressourcen.  
→ In `BaseLayout.astro`: `<link rel="preload" as="font" crossorigin>` für die beiden Varianten hinzufügen.  
→ Verbessert LCP messbar.

### 2.5 `rel="preconnect"` für externe Domains 🟢
`preconnect` für Supabase und Google Fonts ergänzen.  
→ `<link rel="preconnect" href="https://<project>.supabase.co">` in `BaseLayout.astro`.

### 2.6 Bundle-Splitting / Dynamic Imports für Admin 🟡 ☐
`ClassEditor`, `RegistrationTable` und `AdminPermissionsManager` innerhalb des Admin-Dashboards dynamisch importieren.  
→ Bei weiterem Bundle-Druck Admin-Komponenten via `React.lazy()` + `Suspense` laden.

### 2.7 Service Worker / Offline-Cache 🔴
Statische Assets (CSS, Fonts, OG-Images) können gecacht werden.  
→ Workbox-basierter SW: Network-First für API, Cache-First für Assets.  
→ Ermöglicht #25 Offline-Detection sauber umzusetzen.

---

## 3. Refactoring & Code-Qualität

### 3.1 Gemeinsamer `useWorkshopData`-Hook 🟡
`WorkshopPage.tsx` und `ClassList.tsx` duplizieren den Fetch-Logik für dance_classes/sessions/counts.  
→ Extrahieren in `src/hooks/useWorkshopData.ts`.  
→ Einheitliche Fehlerbehandlung und Loading-State.

### 3.2 `simpleMarkdown` konsolidieren 🟢
`src/lib/markdown.ts` (`simpleMarkdown`) und `stripMarkdown` in `AddToCalendar.tsx` duplizieren Markdown-Logik.  
→ `stripMarkdown` in `src/lib/markdown.ts` exportieren und importieren.

### 3.4 Typen für Edge Function Payloads 🟡
Request/Response-Typen der Edge Functions sind undokumentiert.  
→ Shared-Types-Datei `supabase/functions/_shared/types.ts` mit `RegisterRequest`, `RegisterResponse`, etc.  
→ Im Frontend bei den `fetch`-Calls nutzen.

### 3.5 Error-Boundary für React-Inseln 🟢
Kein `ErrorBoundary` um `WorkshopPage`, `RegistrationForm`, `AdminDashboard`.  
→ Wenn eine Komponente crasht, sieht der User eine leere Seite.  
→ Generische `<ErrorBoundary fallback={<ErrorFallback />}>` Wrapper ergänzen.

### 3.6 Env-Variablen-Validierung beim Build 🟢
`PUBLIC_SUPABASE_URL` und `PUBLIC_SUPABASE_ANON_KEY` werden still ignoriert wenn sie fehlen.  
→ In `astro.config.mjs` prüfen und Build-Fehler werfen wenn sie nicht gesetzt sind:  
```ts
if (!process.env.PUBLIC_SUPABASE_URL) throw new Error('Missing env: PUBLIC_SUPABASE_URL');
```

---

## 4. Datenbank & Backend

### 4.1 DB-Index auf `registrations.email` 🟢
Für die Admin-Suche einen Index auf `email` ergänzen.  
→ `CREATE INDEX ON registrations(lower(email))` für case-insensitive Suche.

### 4.2 `pg_cron` Reminder-Mail 🔴
Kein automatischer Reminder vor Workshops.  
→ `pg_cron`-Job in Supabase: täglich prüfen welche Sessions in 3 Tagen stattfinden.  
→ Für jede Confirmed-Registration eine Reminder-Mail senden.  
→ `email_type: 'reminder'` in `registration_history` loggern.

### 4.3 Soft-Delete für dance_classes 🟡
Derzeit werden Klassen mit `is_public = false` versteckt, aber echtes Löschen entfernt Registrierungsdaten.  
→ `deleted_at TIMESTAMP` Spalte hinzufügen.  
→ RLS-Policy: `deleted_at IS NULL` in allen Queries.

### 4.4 Waitlist-Aufrücken automatisieren 🔴
Wenn eine confirmed Anmeldung cancelled wird, rückt niemand automatisch nach.  
→ Postgres-Trigger auf `registrations.status` UPDATE:  
  wenn `new_status = 'cancelled'` → älteste Waitlist-Eintrag für gleiche Klasse und Rolle → `pending` setzen + E-Mail.

### 4.5 `class_registration_counts` als Materialized View 🟡
Die View wird bei jeder Abfrage neu berechnet.  
→ Als Materialized View + automatisches Refresh via Trigger auf `registrations`.  
→ Lese-Performance bei vielen gleichzeitigen Nutzern verbessert.

### 4.6 Backup-Strategie dokumentieren 🟢
Supabase hat Point-in-Time-Recovery auf Pro-Plan.  
→ `docs/runbook.md` mit Backup-Frequenz, Restore-Prozedur, RTO/RPO.

### 4.7 Multi-Session-Registrierung in DB 🔴
Aktuell: Eine Registrierung pro dance_class (nicht pro session).  
→ Für Workshops mit mehreren Terminen: `registration_sessions` Mapping-Tabelle (registration_id → session_id).  
→ Ermöglicht „ich kann nur an Termin 1 und 3 kommen".

---

## 5. Features

### 5.2 Self-Service Stornierung 🔴 ☐
Kein Storno-Link in der Bestätigungs-Mail.  
→ Beim Insert: `cancel_token UUID DEFAULT gen_random_uuid()` in `registrations`.  
→ Neue Seite `de/stornierung/[token].astro` → setzt Status auf `cancelled`.  
→ RLS: Token-basiert, kein Login nötig.

### 5.3 Pre-fill via URL-Parameter 🟢 ☐
Direkt-Links aus Newsletter/Reminder-Mails:  
`?email=foo@bar.com&name=Foo&class=<id>` → `RegistrationForm` Felder + Workshop vorausfüllen.  
→ Name und E-Mail aus den URL-Parametern vorausfüllen.

### 5.4 Per-Workshop Retry bei Teilfehler 🟡 ☐
Wenn 1 von 3 Anmeldungen fehlschlägt, muss der User alles neu absenden.  
→ Im Error-Item ein „Erneut versuchen"-Button, der nur diesen einen Workshop nochmal submitted.  
→ Den übrigen Form-State erhalten und nur `selectedClassIds` auf den Fehlgeschlagenen setzen.

### 5.5 Wartelisten-Urgency-Badge 🟢 ☐
→ Wenn ≤ 2 freie Plätze: kleines rotes Badge „Nur noch 2 Plätze!" auf der Karte.  
→ Klassischer ehrlicher Conversion-Booster.

### 5.6 `beforeunload`-Dialog bei dirty Form 🟢 ☐
Die öffentliche Registrierung soll bei ungespeicherten Änderungen vor dem Verlassen warnen.  
→ `window.addEventListener('beforeunload', handler)` wenn `isDirty`.  
→ Nach Submit deaktivieren.

### 5.7 Name/E-Mail per `localStorage` vorausfüllen 🟢 ☐
→ Beim ersten erfolgreichen Submit: `localStorage.setItem('reg_name', name)`.  
→ Beim Mount gespeicherte Werte aus `localStorage` in die Felder übernehmen.  
→ Auch nützlich nach versehentlichem Seitenreload.

### 5.8 Konfetti bei Bestätigung 🟢 ☐
`canvas-confetti` (~3 KB) einmalig beim Mount der Confirmation-View triggern.  
→ `prefers-reduced-motion` respektieren: kein Konfetti wenn gesetzt.  
→ Reine Freude, klarer UX-Signalwert.

### 5.9 „Workshop teilen"-Button 🟢 ☐
Web Share API (mobil) / Copy-to-Clipboard (Desktop):  
„Ich tanze am 15.6. Collegiate Shag – komm mit!"  
→ In der Confirmation-View unter der Workshop-Liste.

### 5.10 Offline-Detection 🟢 ☐
`navigator.onLine` + `window.addEventListener('offline')`:  
→ Wenn beim Submit offline → Meldung „Keine Internetverbindung, bitte später erneut versuchen".  
→ Form-State bewahren, kein Datenverlust.

### 5.11 Sticky Submit-Button auf Mobile 🟢 ☐
Auf langen Formularen scrollt der Button aus dem Viewport.  
→ `position: sticky; bottom: 1rem` auf `< md`-Breakpoint, `md:static`.  
→ Leichter `backdrop-blur` + weißer Gradient oben.

### 5.12 Internationaler Redirect via Accept-Language 🟢 ☐
Root `/` leitet hart zu `/de/` weiter.  
→ In `src/middleware.ts` `Accept-Language`-Header auswerten:  
  en → `/en/`, alles andere → `/de/`.

### 5.13 Admin: Massen-E-Mail an eine Klasse 🔴 ☐
Kein Weg, alle Teilnehmer einer Klasse auf einmal anzuschreiben.  
→ In `RegistrationTable`: „E-Mail an alle Confirmed senden"-Button mit Textarea für Freitext.  
→ Edge Function: `batch-email/index.ts`.

### 5.15 Warteliste mit Stellen-Anzeige 🟡 ☐
User sieht nicht wo er auf der Warteliste steht.  
→ Bei Waitlisted-Status in der Bestätigungs-E-Mail: „Du bist auf Platz X der Warteliste."  
→ Berechnung: `COUNT(*) WHERE status='waitlisted' AND role=? AND created_at < registrierung.created_at`.

### 5.16 Permalinks pro Workshop mit Anker 🟢 ☐
Wenn der User eine Workshop-Karte öffnet: URL via `history.replaceState` auf `#workshop-<slug>` updaten.  
→ Hash-Anker, automatisches Aufklappen und gezieltes Scrollen umsetzen.  
→ Macht jeden Workshop verlinkbar/teilbar und kombiniert perfekt mit dem dynamischen OG-Image (8.3).

### 5.17 „Erstes Mal hier?"-Onboarding-Banner 🟢 ☐
Auf `/de/workshops/` ein dismissbarer Banner für Neulinge:  
„Noch nie Shag getanzt? → 30 Sek Video erklärt's" mit YouTube-/Vimeo-Link.  
→ Dismiss-State in `localStorage` speichern.  
→ Senkt Hemmschwelle für Anfänger.

### 5.18 Wärmere Microcopy & menschliche Tonalität 🟢 ☐
Statt „Anmeldung erfolgreich" → „Yay! Wir sehen uns am Tanzparkett 🕺".  
Statt „Fehler bei der Validierung" → „Hmm, da fehlt noch was".  
→ Klein, aber Identität-prägend für ein Tanzangebot.  

### 5.19 Was-ist-Shag-Mini-Erklärer 🟢 ☐
→ Einen einklappbaren Abschnitt mit 1–2 Sätzen und Video-Einbettung direkt auf der Workshops-Seite ergänzen.

### 5.20 Trust-Indikatoren auf Landing-Seite 🟡 ☐
„Seit 2023 · 12 Workshops · 180 glückliche Tänzer*innen" als animierter Counter.  
→ Aus DB-Aggregation (count distinct dance_classes, confirmed registrations).  
→ Ehrlich statt vage — klassischer Trust-Booster.

### 5.21 Testimonial-Karussell 🟡 ☐
Zwei bis drei kurze Original-Zitate ehemaliger Teilnehmer mit Vorname + Initialen.  
→ Neue Tabelle `testimonials` oder einfach hardcoded in i18n-Files.  
→ Sozialer Proof auf der Landing-Seite.

### 5.22 „Benachrichtige mich wenn offen"-Subscribe 🟡 ☐
Für Workshops im `upcoming`-State (noch nicht offen):  
→ Button „Erinnere mich" → E-Mail in `notifications`-Tabelle.  
→ Wenn `registration_opens_at` erreicht → automatische Mail via `pg_cron`.  
→ Fängt Interesse zur Top-Conversion-Zeit ein.

### 5.23 „Plus-Eins"-/Partner-Hinweis im Formular 🟢 ☐
Checkbox und situationsabhängigen Hinweis bei Rollen-Ungleichgewicht ergänzen.  
→ Bei Rollen-Ungleichgewicht eingeblendeter Hinweis: „Aktuell fehlen Follows – bring gerne jemand mit!"  
→ Adressiert Pain-Point von Paar-Tänzen direkt.

### 5.24 ICS-Subscribe-Feed (statt nur Einzel-Download) 🟡 ☐
→ Zusätzlich öffentlicher `webcal://shagadeus.at/calendar.ics` Feed mit allen kommenden Workshops.  
→ User abonniert einmal, sieht künftige automatisch.  
→ Astro-Endpoint `pages/calendar.ics.ts` generiert dynamisch aus `dance_classes`.

---

## 6. UI / UX

### 6.4 Optimistic Per-Workshop Lade-Indikator 🟡 ☐
Während `Promise.allSettled` über alle gewählten Klassen läuft, kein Progress-Feedback.  
→ Pro Workshop-Item im Submit: kleiner Spinner → ✓ / ✗.  
→ User sieht „der erste ist durch, der zweite läuft noch".

### 6.5 E-Mail-Tippfehler-Hinweis 🟡 ☐
Kein Client-Feedback bei typischen Tippfehlern.  
→ `email-spell-checker` (npm: `@zootools/email-spell-checker`, 1 KB):  
  Warnung „Meintest du @gmail.com?" unter dem E-Mail-Feld.  
→ Nicht blockierend, nur als Hinweis.


### 6.8 Toast-Benachrichtigungen für Admin-Aktionen 🟡 ☐
Admin-Aktionen (Status-Änderung, Klasse gespeichert) geben kein visuelles Feedback außer einer Seiten-Reload.  
→ Leichtgewichtiger Toast (CSS-only, kein Extra-Package):  
  oben rechts, 3 Sekunden, grün/rot je nach Ergebnis.

### 6.10 Keyboard-Navigation der Workshop-Akkordeons 🟢 ☐
Workshop-Karten werden als Buttons gerendert.  
→ `Enter` / `Space` öffnet, `Escape` schließt, `Tab` navigiert zum nächsten Item.  
→ Prüfen ob `role="region"` + `aria-labelledby` auf dem expandierten Bereich gesetzt ist.

### 6.11 Kapazität als Fortschrittsbalken 🟡 ☐
Aktuell wird „3 / 12 Leads frei" als Zahl gezeigt.  
→ Zweifarbiger Bar (Leads / Follows nebeneinander), der live zeigt wie voll der Workshop ist und welche Rolle Mangelware ist.  
→ Wirkt ehrlicher und ist auf einen Blick erfassbar.  
→ Fördert Rollenbalance, weil die unterrepräsentierte Rolle sichtbar wird.

### 6.12 Monats-Gruppierung mit Sticky-Datumsleiste 🟡 ☐
In `ClassList.tsx` werden Workshops chronologisch sortiert, aber visuell als ein Strom.  
→ Trennüberschriften „Juni 2026 · 3 Workshops" zwischen den Karten.  
→ Sticky-Header beim Scrollen (`position: sticky; top: <header-height>`).  
→ Reduziert kognitive Last, besonders auf Mobile.

### 6.13 Multi-Step `RegistrationForm` auf Mobile 🔴 ☐
Bei mehreren ausgewählten Workshops wird das Formular auf Mobile sehr lang.  
→ Stepper „1 Auswahl → 2 Rolle → 3 Daten → 4 Bestätigung" nur auf `< md`-Breakpoint.  
→ Auf Desktop weiter als eine Seite.  
→ Senkt Abbruchrate spürbar.

### 6.17 Filter-Pills mit Result-Counter 🟡 ☐
→ Multi-Select-Chips für „Diese Woche" / „Diesen Monat" / „Donations" / „Anmeldung offen" und Live-Counter pro Pill fehlen noch.

### 6.18 Sticky Mini-Cart-CTA auf Mobile 🟡 ☐
Wenn `selectedIds.size > 0` auf der Workshops-Seite:  
→ Am Bildschirmrand unten ein dünner Bar „2 Workshops gewählt → Weiter zur Anmeldung".  
→ Spart das Hochscrollen zum Anmelde-Button.  
→ Kombiniert gut mit 5.11 (Sticky Submit) im Formular.

### 6.19 Bottom-Sheet-Navigation auf Mobile 🔴 ☐
Statt nur Top-Header mit kleinen Tap-Targets:  
→ Optionale Bottom-Navigation (Home / Workshops / Anmelden / Über uns).  
→ 44 px+ Touch-Targets, einhandbedienbar.  
→ Toggle über `useMediaQuery` Hook nur unter `md`.

### 6.20 Workshop-Vergleichsansicht bei Mehrfachauswahl 🔴 ☐
Wenn `selectedIds.size >= 2`:  
→ Kleines Modal/Panel zeigt gewählte Workshops Side-by-Side (Datum, Preis, Level, Lehrer).  
→ Hilft bei finaler Entscheidung „nehme ich beide oder nur einen?"  
→ Aufrufbar über „Vergleichen"-Button im Mini-Cart-CTA (6.18).

---

## 7. Design

### 7.1 Konsistentes Icon-System 🟡 ☐
Icons werden teils als Inline-SVG, teils als Text-Characters (▼) gerendert.  
→ Lucide-React oder Hero-Icons als einheitliches System einführen.  
→ Tree-shakeable, typsicher, konsistente Strichstärke.

### 7.4 Responsive Flyer-Pages 🟡 ☐
`flyer1.astro`, `flyer2.astro`, `flyer3.astro` sind auf A5 fixiert.  
→ Auf mobilen Screens sollten sie sich proportional skalieren (`transform: scale()`-Trick).

### 7.5 Micro-Animations für Status-Badges 🟢 ☐
→ Ein echtes Urgency-Badge mit Reduced-Motion-Variante ergänzen.

### 7.6 Print-Stylesheet für Confirmation 🟢 ☐
`@media print` fehlt komplett.  
→ Navigation, Footer, Buttons ausblenden.  
→ Nur Bestätigungs-Inhalt mit Workshop-Terminen drucken.  
→ Hilfreich für Reisekostenabrechnung / Buchungsnachweis.

### 7.7 Color-Coded Level-Pills 🟢 ☐
Anfänger = grün, Mittel = teal, Fortgeschritten = coral.  
→ Konsistent in Filter-Pills, Workshop-Karten und Bestätigungs-Mail.  
→ Macht Scannen auf Listenseiten viel schneller.  
→ Farb-Tokens in Tailwind v4 `@theme` definieren (passt zu 3.7).

### 7.9 Dunkelmodus 🔴 ☐
`@media (prefers-color-scheme: dark)` + manueller Toggle im Header.  
→ CSS-Custom-Properties in `global.css` sind die ideale Basis — nur ein zweites Set Variablen nötig.  
→ Persistenz via `localStorage` + `data-theme`-Attribut auf `<html>`.

### 7.10 Smooth Accordion-Animation 🟢 ☐
Workshop-Karten klappen aktuell hart auf.  
→ `grid-template-rows: 0fr → 1fr`-Trick für smooth Height-Transition ohne JS-Hack.  
→ `prefers-reduced-motion` respektieren (siehe 9.4).

---

## 8. SEO & Discoverability

### 8.2 Open-Graph Tags vollständig setzen 🟡 ☐
→ Pro Seite: `og:title`, `og:description`, `og:image` (1200×630 PNG), `og:type`.  
→ Twitter-Card: `twitter:card: summary_large_image`.

### 8.3 Dynamisches OG-Image pro Workshop 🔴 ☐
→ Astro-Integration `@vercel/og` oder `satori` für serverless Image-Generierung.  
→ OG-Image enthält Workshop-Titel, Datum, Ort, Shagadeus-Branding.  
→ Geteilte Links sehen professioneller aus.

### 8.4 `sitemap.xml` automatisch generieren 🟢 ☐
→ `@astrojs/sitemap` Integration:  
```ts
import sitemap from '@astrojs/sitemap';
// in astro.config.mjs integrations
```
→ Alle Seiten automatisch indiziert.

### 8.5 `robots.txt` prüfen 🟢 ☐
→ `public/robots.txt` anlegen:  
```
User-agent: *
Disallow: /admin/
Sitemap: https://shagadeus.at/sitemap.xml
```

---

## 9. Accessibility (a11y)

### 9.2 Skip-to-Content-Link 🟢 ☐
Für Tastatur-Nutzer: unsichtbarer Link am Seitenanfang der beim Fokus sichtbar wird:  
```html
<a href="#main-content" class="sr-only focus:not-sr-only">Zum Inhalt springen</a>
```

### 9.3 Kontrastverhältnis prüfen 🟡 ☐
Teal (`#2A9D8F`) auf weißem Hintergrund verfehlt möglicherweise WCAG AA (4.5:1) für kleine Texte.  
→ Lighthouse / axe-core Audit durchführen.  
→ Ggf. `#1f7a70` (teal-dark) für Text verwenden.

### 9.4 `prefers-reduced-motion` als globaler Hook 🟢 ☐
→ `src/hooks/useReducedMotion.ts` zentral implementieren.  
→ Überall konsultiert: Konfetti (5.8), Accordion-Animation (7.10), Smooth-Scroll, Badge-Pulse (7.5).

### 9.5 Focus-Visible-Styles vereinheitlichen 🟢 ☐
In `global.css` einen klaren globalen `:focus-visible`-Fallback ergänzen:  
```css
:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
```
→ Tailwind v4 `@theme` macht das trivial.  
→ Verbessert Tastatur-Bedienbarkeit signifikant.

### 9.6 Live-Region für Status-Änderungen 🟢 ☐
→ Beim Umschalten von `selectedIds` eine Ansage wie „Workshop hinzugefügt, 2 ausgewählt" ergänzen.

---

## 10. Testing

### 10.1 E2E-Tests mit Playwright ausbauen 🔴 ☐
→ Playwright-Tests für:
  - Workshop-Seite laden, Karte aufklappen
  - Formular ausfüllen und absenden (Mock-Supabase)
  - Admin-Login + Klasse bearbeiten


### 10.4 `register.test.ts` MX-Validierung ergänzen 🟢 ☐
Sobald MX-Check eingebaut ist (Punkt 1.4) → Test mit gemocktem DoH-Endpoint.

---

## 11. DevOps & Monitoring

### 11.2 Error-Monitoring (Sentry) 🟡 ☐
Frontend-Fehler und Edge-Function-Crashes werden nicht gemeldet.  
→ `@sentry/astro` Integration für Frontend.  
→ Sentry-SDK in Edge Functions für Backend.  
→ Alert bei 5xx-Spike oder neuer Error-Klasse.

### 11.3 Analytics (privacy-first) 🟡 ☐
→ Plausible oder Umami (selbst-gehostet, cookie-frei, DSGVO-konform) einführen.  
→ Events: `page_view`, `form_started`, `workshop_selected`, `registration_success`.

### 11.5 Supabase-Alert auf Registration-Spike 🟢 ☐
→ Supabase-Logflare: Alert wenn `> 50 Inserts/Minute` auf `registrations` (Bot-Erkennung).

### 11.6 Staging-Environment 🟡 ☐
→ Zweites Supabase-Projekt + eigene Vercel-Preview-URL für Branches einrichten.  
→ Ermöglicht Migrations-Tests ohne Produktionsdaten zu riskieren.

---

## 12. Internationalisierung (i18n)

### 12.2 `Intl.RelativeTimeFormat` für Zeitangaben 🟢 ☐
Zeitangaben wie „Anmeldung öffnet in 3 Tagen" sind hardcoded.  
→ `Intl.RelativeTimeFormat(locale)` nutzen für locale-korrekte relative Zeitangaben.

### 12.3 Internationale Zeitzonen-Anzeige 🟢 ☐
Workshop-Zeiten in Wiener Zeit. Für internationale Gäste:  
→ Wenn `Intl.DateTimeFormat().resolvedOptions().timeZone !== 'Europe/Vienna'` → Tooltip mit lokaler Zeit.

---

## Priorisierungs-Quicklist

Offene Aufgaben, nach zeitlicher Priorität sortiert.

### Sofort (< 1 Tag, hohe Wirkung)
- 3.6 Env-Variablen-Validierung
- 5.3 Name/E-Mail-Prefill via URL-Params
- 5.6 beforeunload-Dialog für das öffentliche Registrierungsformular
- 5.7 localStorage Pre-fill
- 5.16 Permalinks pro Workshop
- 5.18 Wärmere Microcopy
- 7.7 Color-Coded Level-Pills
- 7.10 Smooth Accordion-Animation
- 8.4 sitemap.xml
- 9.4 useReducedMotion-Hook
- 9.5 Focus-Visible-Styles
- 9.6 Live-Region für Status

### Nächste Sprint (1–3 Tage)
- 1.2 Rate-Limiting
- 1.4 MX-Validierung
- 2.1 Supabase-Queries konsolidieren
- 2.4 Font-Preload
- 2.5 Preconnect
- 5.22 Benachrichtige-mich-Subscribe
- 5.24 ICS-Subscribe-Feed
- 6.11 Kapazitäts-Fortschrittsbalken
- 6.12 Monats-Gruppierung
- 6.17 Filter-Pills mit Counter
- 6.18 Sticky Mini-Cart-CTA
- 3.1 useWorkshopData-Hook
- 5.2 Self-Service Stornierung
- 5.5 Urgency-Badge
- 6.5 E-Mail-Tippfehler

### Mittelfristig
- 2.2 Server-Side Prefetch
- 4.2 Reminder-Mails (pg_cron)
- 4.4 Waitlist Auto-Aufsteig
- 5.13 Admin Massen-E-Mail
- 6.13 Multi-Step-Formular auf Mobile
- 6.19 Bottom-Sheet-Navigation
- 6.20 Workshop-Vergleich
- 10.1 E2E-Tests
- 11.2 Sentry
