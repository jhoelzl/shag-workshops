# Verbesserungsvorschläge für den Workshop-Registrierungsprozess

Erstellt: 21. Mai 2026
Aktualisiert: 22. Mai 2026 (gegen aktuellen Repo-Stand geprüft)
Bezug: `src/components/RegistrationForm.tsx`, `supabase/functions/register/`, `src/i18n/`

Priorisierung nach Impact (Aufwand vs. Nutzen).

---

## 🔴 Hoch — Quick Wins mit großer Wirkung


### 4. E-Mail-Tippfehler-Erkennung
„Meintest du `@gmail.com`?" bei `gnail.com`, `gmial.com`, etc.
Library https://github.com/smashsend/email-spell-checker 

Reduziert Bounce-Mails messbar.

---

## 🟡 Mittel — UX-Politur

### 9. Form-Daten in `localStorage` zwischenspeichern
Name/E-Mail vor-ausfüllen, wenn User wiederkommt.
Auch hilfreich, wenn sie versehentlich die Seite verlassen — Daten sind nicht weg.

---

## 🟢 Nice-to-have / strategisch

### 11. Stornierungs-/Self-Service-Link in der E-Mail
Token-basierter Link → „Anmeldung stornieren" ohne Admin-Aufwand.
Spart Mail-Verkehr.

### 12. Wartelisten-Mechanismus
Wenn Lead/Follow voll: „Auf Warteliste setzen" statt komplettem Block.
Felder `leads_available` / `follows_available` existieren bereits
— wäre eine logische Erweiterung.

### 13. Reminder-Mail X Tage vor dem Workshop
Reduziert No-Shows. Kann ein einfacher `pg_cron`-Job auf der Supabase-DB sein.

### 14. Admin-Trigger-Verzögerung sichtbar machen
Auf der Bestätigungs-Seite ggf. „Wir bestätigen meistens innerhalb von X Stunden"
— setzt Erwartungen und reduziert „kommt da noch was?"-Nachfragen.

### 15. Honeypot statt CAPTCHA
Unsichtbares Feld (`tabindex="-1"`, CSS-versteckt)
— wenn ausgefüllt → Bot.
Kein UX-Reibung, hohe Wirksamkeit gegen einfache Spam-Bots.

---

## ✨ Neue Ideen (21. Mai 2026)

### 16. Per-Workshop Retry-Button bei Teilfehler
Aktuell: Wenn 1 von 3 Anmeldungen fehlschlägt, muss der User die ganze Form
noch mal absenden (mit Risiko von `DUPLICATE`-Fehlern bei den schon erfolgten).
Besser: Im Result-Item ein „Erneut versuchen"-Button, der nur diesen einen
Workshop noch mal pusht. Form-Daten sind ja noch im State.

### 17. Kapazitäts-Urgency-Hinweis
Wenn `leads_available <= 3` oder `follows_available <= 3`:
Kleines orangefarbenes Badge „Nur noch 2 Lead-Plätze frei!" neben dem Workshop.
Klassischer Conversion-Booster, ehrlich (echte Zahl) statt fake-urgency.

### 18. `beforeunload`-Warnung bei unsaved Form-Daten
Wenn der User etwas ausgefüllt hat aber nicht abgeschickt und die Seite
verlassen will: Browser-Native-Dialog „Änderungen wirklich verwerfen?".
Verhindert Datenverlust durch versehentliches Schließen / Back-Button.
**Wichtig**: Nur aktivieren wenn Felder dirty, nach Submit wieder ausschalten.

### 19. Sticky Submit-Button auf Mobile
Auf langen Forms scrollt der Submit-Button aus dem Viewport.
`position: sticky; bottom: 0;` auf Mobile (`md:static`) mit leichtem
Backdrop-Blur. Spart Scroll-zurück-zum-Button-Reibung.

### 20. Optimistic Per-Workshop Loading-Indikator
Während `Promise.allSettled` läuft, in der Workshop-Liste pro Item einen
kleinen Spinner zeigen, der einzeln auf success/error wechselt.
User sieht „aha, der erste ist durch, der zweite läuft noch" statt einem
einzelnen „Wird gesendet…"-Text. Macht die parallele Submission spürbar.

### 21. Pre-fill via Query-Params
Direkt-Links aus Newsletter / Reminder-Mails:
`?email=foo@bar.com&name=Foo&workshop=<id>` → Felder + Workshop-Auswahl
vorausgefüllt. Friction für Stammgäste praktisch null.

Status aktuell:
- Workshop-Preselect via URL ist bereits vorhanden (`?class=<id>`)
- Name/E-Mail-Prefill per Query-Param fehlt noch

### 22. Konfetti / Mikrointeraktion bei Success
Auf der Confirmation-Page einmalig `canvas-confetti` (oder CSS-only)
beim Mount triggern. Reine Freude, kostet ~3 KB, kein Pflichtfeature.
Optional: `prefers-reduced-motion` respektieren.

### 23. „Workshop teilen"-Button auf Confirmation-Page
Web-Share-API (mobil) bzw. Copy-Link-Fallback (Desktop):
„Ich gehe zum Collegiate Shag Workshop am 15.6. — komm mit!"
Niedrigschwelliger Empfehlungs-Mechanismus.

### 24. Server-seitige E-Mail-MX-Validierung
In `supabase/functions/register/index.ts`: DNS-MX-Lookup der Domain via
Cloudflare DoH (`https://cloudflare-dns.com/dns-query?name=<domain>&type=MX`).
Kein MX-Record → Reject mit `code: "VALIDATION"`.
Fängt `@gmial.com` & Wegwerf-Domains, die Client-Tippfehler-Check übersieht.

### 25. Offline-Detection
`navigator.onLine` + `window.addEventListener('offline')`:
Wenn beim Submit offline → klare Meldung „Keine Internetverbindung,
bitte später erneut versuchen" statt generischem Netzwerk-Fehler.
Form-Daten via #9 localStorage retten.

### 26. PDF / Print-Stylesheet der Confirmation
`@media print` CSS sodass User die Bestätigungs-Seite sauber ausdrucken
oder als PDF speichern kann (für Reisekostenabrechnung / Erinnerung).
Drei Zeilen CSS, hohes Wahrgenommenes-Polish.

### 28. Error-Monitoring (Sentry / Logflare)
Frontend-Errors und Edge-Function-Failures zentral loggen.
Aktuell merkt man Submit-Probleme nur durch User-Beschwerden.
Supabase hat eingebautes Logging via Logflare — einbauen + Alert-Regel
für 5xx-Spikes.

### 29. Funnel-Analytics (privacy-friendly)
Plausible oder Umami (self-hosted, cookie-frei, DSGVO-konform):
Events `form_started`, `workshop_selected`, `form_submitted`,
`registration_success`. Zeigt wo User abspringen.

### 30. Internationale Zeitzonen-Anzeige
Workshop-Zeiten sind in lokaler Wiener Zeit. Für internationale Teilnehmer
optional „14:00 Wien (CEST) = 13:00 London" als Tooltip / Sekundärzeile.
Nicht aufdringlich, aber hilfreich.

### 31. Automatischer Locale-Redirect
`Accept-Language`-Header bei `/` (root) auswerten und auf `/de/` oder `/en/`
weiterleiten. Aktuell: Astro Middleware könnte das übernehmen.

### 33. Open-Graph + Twitter-Cards pro Workshop
Aktuell vermutlich generisches OG-Image. Pro Workshop dynamisches OG-Image
(Astro hat dafür `@vercel/og` oder satori) mit Workshop-Titel + Datum.
Geteilte Links sehen dann viel professioneller aus.

### 34. „Letzte Anmeldungen"-Social-Proof
Optional klein unter der Workshop-Karte: „12 Anmeldungen in den letzten 7 Tagen"
(aggregiert, ohne Namen). DSGVO-unkritisch da rein statistisch.
Klassischer Trust-Booster.
