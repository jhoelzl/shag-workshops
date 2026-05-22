import { useEffect, useRef, useState } from 'react';
import type { DanceClass, ClassSession } from '../lib/database.types';
import type { Locale } from '../i18n/index';
import de from '../i18n/de.json';
import en from '../i18n/en.json';
import AddToCalendar from './AddToCalendar';

const translations = { de, en };

interface Props {
  locale: Locale;
  danceClasses: (DanceClass & { sessions?: ClassSession[] })[];
  supabaseFunctionsUrl: string;
  supabaseAnonKey: string;
  selectedClassIds: Set<string>;
  onToggleClass: (id: string) => void;
}

type WorkshopResult = { classId: string; className: string; type: 'success' | 'error'; message: string };

export default function RegistrationForm({ locale, danceClasses, supabaseFunctionsUrl, supabaseAnonKey, selectedClassIds, onToggleClass }: Props) {
  const i18n = translations[locale];

  const [role, setRole] = useState<'lead' | 'follow'>('lead');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [comment, setComment] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [privacyError, setPrivacyError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isRoleInfoOpen, setIsRoleInfoOpen] = useState(false);
  const [isPartnerInfoOpen, setIsPartnerInfoOpen] = useState(false);
  const [results, setResults] = useState<WorkshopResult[]>([]);

  // Inline validation: track which fields have been touched (blurred at least once
  // or after a submit attempt) so we only show errors when appropriate.
  const [touched, setTouched] = useState<{ name: boolean; email: boolean }>({
    name: false,
    email: false,
  });

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const nameError = name.trim().length === 0 ? i18n.registration.validation_name_required : null;
  const emailTrimmed = email.trim();
  const emailError = !emailTrimmed
    ? i18n.registration.validation_email_required
    : !EMAIL_PATTERN.test(emailTrimmed)
      ? i18n.registration.validation_email_invalid
      : null;

  const isFormValid =
    !nameError && !emailError && privacyConsent && selectedClassIds.size > 0;

  const liveFeedbackMessages: string[] = [];
  if (touched.name && nameError) liveFeedbackMessages.push(nameError);
  if (touched.email && emailError) liveFeedbackMessages.push(emailError);
  if (privacyError) liveFeedbackMessages.push(i18n.registration.privacy_consent_required);
  if (results.length > 0) {
    for (const r of results) {
      const title = r.type === 'success' ? i18n.registration.success_title : i18n.registration.error_title;
      liveFeedbackMessages.push(`${title}: ${r.className}. ${r.message}`);
    }
  }

  // Dev-only preview: open the page with ?preview=confirmation to see the success view
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('preview') === 'confirmation') {
      const mock = danceClasses.slice(0, Math.max(1, Math.min(2, danceClasses.length))).map((dc) => ({
        classId: dc.id,
        className: locale === 'de' ? dc.title_de : dc.title_en,
        type: 'success' as const,
        message: i18n.registration.success_message,
      }));
      if (mock.length === 0) {
        mock.push({
          classId: 'preview',
          className: locale === 'de' ? 'Beispiel-Workshop' : 'Sample workshop',
          type: 'success',
          message: i18n.registration.success_message,
        });
      }
      setResults(mock);
    }
  }, [danceClasses, locale, i18n]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedClassIds.size === 0) return;

    // Surface any pending field errors that the user hasn't seen yet
    if (nameError || emailError) {
      setTouched({ name: true, email: true });
      return;
    }
    if (!privacyConsent) {
      setPrivacyError(true);
      return;
    }

    setSubmitting(true);
    setResults([]);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (supabaseAnonKey) {
      headers.apikey = supabaseAnonKey;
    }

    const classIds = Array.from(selectedClassIds);

    // Fire all registration requests in parallel for better perceived performance
    const settled = await Promise.allSettled(
      classIds.map((classId) =>
        fetch(`${supabaseFunctionsUrl}/register`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            dance_class_id: classId,
            role,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            partner_name: partnerName.trim() || null,
            comment: comment.trim() || null,
            locale,
          }),
        }).then(async (response) => {
          const data = await response.json().catch(() => ({}));
          return { response, data };
        })
      )
    );

    const newResults: WorkshopResult[] = settled.map((outcome, idx) => {
      const classId = classIds[idx];
      const dc = danceClasses.find((c) => c.id === classId);
      const className = dc ? (locale === 'de' ? dc.title_de : dc.title_en) : classId;

      if (outcome.status === 'rejected') {
        return { classId, className, type: 'error', message: i18n.registration.error_generic };
      }

      const { response, data } = outcome.value;
      if (!response.ok) {
        let message: string;
        if (data.code === 'DUPLICATE') {
          message = i18n.registration.error_duplicate;
        } else if (data.code === 'CLOSED') {
          message = i18n.registration.error_closed;
        } else if (data.code === 'VALIDATION') {
          message = i18n.registration.error_validation;
        } else {
          message = data.message || data.error || i18n.registration.error_generic;
        }
        return { classId, className, type: 'error', message };
      }

      return { classId, className, type: 'success', message: i18n.registration.success_message };
    });

    setResults(newResults);

    // Deselect successfully registered workshops
    if (newResults.some((r) => r.type === 'success')) {
      setName('');
      setEmail('');
      setPartnerName('');
      setComment('');
      setPrivacyConsent(false);
      setTouched({ name: false, email: false });
      newResults.filter((r) => r.type === 'success').forEach((r) => onToggleClass(r.classId));
    }

    setSubmitting(false);
  }

  // Show full confirmation view when all submissions succeeded
  const allSucceeded = results.length > 0 && results.every((r) => r.type === 'success');
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const resultContainerRef = useRef<HTMLDivElement>(null);

  // Move focus to the confirmation heading once the success view is shown
  useEffect(() => {
    if (allSucceeded) {
      confirmationHeadingRef.current?.focus();
    }
  }, [allSucceeded]);

  // Move focus to inline result messages for partial success/error responses.
  useEffect(() => {
    if (!allSucceeded && results.length > 0) {
      resultContainerRef.current?.focus();
    }
  }, [results, allSucceeded]);

  if (allSucceeded) {
    const successResults = results.filter((r) => r.type === 'success');
    const registeredClasses = successResults
      .map((r) => danceClasses.find((dc) => dc.id === r.classId))
      .filter((dc): dc is DanceClass & { sessions?: ClassSession[] } => Boolean(dc));
    const subtitle =
      successResults.length === 1
        ? i18n.registration.confirmation_subtitle_one
        : i18n.registration.confirmation_subtitle_many;

    return (
      <div className="w-full bg-surface rounded-2xl shadow-lg border border-bg-warm p-6 max-w-lg" role="status" aria-live="polite">
        {/* Animated green check */}
        <div className="flex justify-center mb-5">
          <div className="relative">
            <span className="absolute inset-0 rounded-full bg-success/15 animate-ping" aria-hidden="true"></span>
            <div className="relative w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
              <svg
                className="w-9 h-9 text-success"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                  style={{
                    strokeDasharray: 30,
                    strokeDashoffset: 0,
                    animation: 'check-draw 600ms ease-out',
                  }}
                />
              </svg>
            </div>
          </div>
        </div>

        <h2
          ref={confirmationHeadingRef}
          tabIndex={-1}
          className="font-display text-2xl font-bold text-text text-center mb-2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded"
        >
          {i18n.registration.confirmation_title}
        </h2>
        <p className="text-sm text-text-muted text-center mb-4">{subtitle}</p>

        {/* Registered workshops */}
        <ul className="mb-6 space-y-1.5">
          {registeredClasses.map((dc) => {
            const title = locale === 'de' ? dc.title_de : dc.title_en;
            const sessions = dc.sessions ?? [];
            const hasSessions = sessions.some((s) => s.session_date && s.start_time && s.end_time);
            return (
              <li
                key={dc.id}
                className="flex items-center gap-2 bg-teal/5 border border-teal/20 rounded-xl px-3 py-2 text-sm font-medium text-teal-dark"
              >
                <svg className="w-4 h-4 text-teal shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="flex-1 min-w-0 truncate">{title}</span>
                {hasSessions && (
                  <AddToCalendar danceClass={dc} sessions={sessions} locale={locale} variant="icon" menuAlign="right" />
                )}
              </li>
            );
          })}
        </ul>

        {/* Stepper */}
        <ol className="relative mb-6">
          {/* Step 1 — done */}
          <li className="relative pl-10 pb-5">
            <span className="absolute left-0 top-0 flex items-center justify-center w-7 h-7 rounded-full bg-success text-white shadow-sm shadow-success/30 z-10">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-success/40" aria-hidden="true"></span>
            <div>
              <div className="font-semibold text-text">{i18n.registration.step_submitted_title}</div>
              <div className="text-xs text-text-muted mt-0.5">{i18n.registration.step_submitted_desc}</div>
            </div>
          </li>

          {/* Step 2 — current (pending) */}
          <li className="relative pl-10 pb-5">
            <span className="absolute left-0 top-0 flex items-center justify-center w-7 h-7 rounded-full bg-white border-2 border-primary text-primary z-10">
              <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" aria-hidden="true"></span>
              <span className="relative w-2 h-2 rounded-full bg-primary"></span>
            </span>
            <span className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-bg-warm" aria-hidden="true"></span>
            <div>
              <div className="font-semibold text-text">{i18n.registration.step_confirmation_title}</div>
              <div className="text-xs text-text-muted mt-0.5">{i18n.registration.step_confirmation_desc}</div>
            </div>
          </li>

          {/* Step 3 — upcoming */}
          <li className="relative pl-10">
            <span className="absolute left-0 top-0 flex items-center justify-center w-7 h-7 rounded-full bg-white border-2 border-bg-warm text-text-muted z-10">
              <span className="w-2 h-2 rounded-full bg-bg-warm"></span>
            </span>
            <div>
              <div className="font-semibold text-text-muted">{i18n.registration.step_workshop_title}</div>
              <div className="text-xs text-text-muted mt-0.5">{i18n.registration.step_workshop_desc}</div>
            </div>
          </li>
        </ol>

        {/* Spam hint */}
        <div className="mb-5 flex items-start gap-2 text-xs text-text-muted bg-bg/60 border border-bg-warm rounded-xl px-3 py-2.5">
          <svg className="w-4 h-4 text-text-muted mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z" />
          </svg>
          <span>{i18n.registration.check_spam}</span>
        </div>

        <button
          type="button"
          onClick={() => setResults([])}
          className="w-full bg-white hover:bg-bg/60 border border-bg-warm text-text font-semibold py-3 px-4 rounded-full transition-colors"
        >
          {i18n.registration.another_registration}
        </button>

        <style>{`
          @keyframes check-draw {
            from { stroke-dashoffset: 30; }
            to   { stroke-dashoffset: 0; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full bg-surface rounded-2xl shadow-lg border border-bg-warm p-6 max-w-lg">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveFeedbackMessages.join(' ')}
      </div>

      <h2 className="font-display text-2xl font-bold text-primary mb-6">{i18n.registration.title}</h2>

      {/* Dance Class Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">{i18n.registration.dance_classes} <span className="text-coral">*</span></label>
        <div className="space-y-2">
          {danceClasses.map((dc) => {
            const title = locale === 'de' ? dc.title_de : dc.title_en;
            const isChecked = selectedClassIds.has(dc.id);
            return (
              <label
                key={dc.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                  isChecked ? 'border-teal bg-teal/5' : 'border-bg-warm bg-bg/50 hover:border-teal/40'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleClass(dc.id)}
                  className="w-4 h-4 rounded accent-teal shrink-0"
                />
                <span className="text-sm">
                  {title}
                  {dc.level ? <span className="text-text-muted ml-1.5">({dc.level})</span> : null}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      {/* Role */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <label className="block text-sm font-medium">{i18n.registration.role} <span className="text-coral">*</span></label>
          <div
            className="relative"
            onMouseEnter={() => setIsRoleInfoOpen(true)}
            onMouseLeave={() => setIsRoleInfoOpen(false)}
          >
            <button
              type="button"
              aria-label={i18n.registration.role_info_label}
              aria-expanded={isRoleInfoOpen}
              aria-controls="role-info-tooltip"
              onClick={() => setIsRoleInfoOpen((prev) => !prev)}
              onBlur={() => setIsRoleInfoOpen(false)}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-teal/35 text-teal text-xs font-bold cursor-pointer"
            >
              i
            </button>
            {isRoleInfoOpen && (
              <div
                id="role-info-tooltip"
                role="tooltip"
                className="absolute left-0 top-7 z-20 w-64 rounded-lg border border-teal/20 bg-white p-3 text-xs text-text-muted shadow-lg"
              >
                {i18n.registration.role_info_text}
              </div>
            )}
          </div>
        </div>
        <div className="relative flex bg-bg-warm rounded-full p-1">
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-teal rounded-full transition-all duration-200 ease-in-out shadow-sm"
            style={{ left: role === 'lead' ? '4px' : 'calc(50% + 0px)' }}
          />
          <button
            type="button"
            onClick={() => setRole('lead')}
            className={`relative z-10 flex-1 py-2.5 text-sm font-semibold rounded-full transition-colors duration-200 ${role === 'lead' ? 'text-white' : 'text-text-muted hover:text-text'}`}
          >
            {i18n.registration.role_lead}
          </button>
          <button
            type="button"
            onClick={() => setRole('follow')}
            className={`relative z-10 flex-1 py-2.5 text-sm font-semibold rounded-full transition-colors duration-200 ${role === 'follow' ? 'text-white' : 'text-text-muted hover:text-text'}`}
          >
            {i18n.registration.role_follow}
          </button>
        </div>
      </div>

      {/* Name */}
      <div className="mb-4">
        <label htmlFor="name" className="block text-sm font-medium mb-1">{i18n.registration.name} <span className="text-coral">*</span></label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, name: true }))}
          required
          autoComplete="name"
          autoCapitalize="words"
          spellCheck={false}
          aria-invalid={touched.name && !!nameError}
          aria-describedby={touched.name && nameError ? 'name-error' : undefined}
          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 outline-none bg-bg/50 ${
            touched.name && nameError
              ? 'border-coral focus:ring-coral/30 focus:border-coral'
              : 'border-bg-warm focus:ring-teal/30 focus:border-teal'
          }`}
        />
        {touched.name && nameError && (
          <p id="name-error" role="alert" className="mt-1 text-xs text-coral">
            {nameError}
          </p>
        )}
      </div>

      {/* Email */}
      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium mb-1">{i18n.registration.email} <span className="text-coral">*</span></label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          required
          autoComplete="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          pattern="[^\s@]+@[^\s@]+\.[^\s@]+"
          aria-invalid={touched.email && !!emailError}
          aria-describedby={touched.email && emailError ? 'email-error' : undefined}
          className={`w-full border rounded-xl px-3 py-2.5 text-sm focus:ring-2 outline-none bg-bg/50 ${
            touched.email && emailError
              ? 'border-coral focus:ring-coral/30 focus:border-coral'
              : 'border-bg-warm focus:ring-teal/30 focus:border-teal'
          }`}
        />
        {touched.email && emailError && (
          <p id="email-error" role="alert" className="mt-1 text-xs text-coral">
            {emailError}
          </p>
        )}
      </div>

      {/* Partner Name */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <label htmlFor="partner_name" className="block text-sm font-medium">{i18n.registration.partner_name}</label>
          <div
            className="relative"
            onMouseEnter={() => setIsPartnerInfoOpen(true)}
            onMouseLeave={() => setIsPartnerInfoOpen(false)}
          >
            <button
              type="button"
              aria-label={i18n.registration.partner_info_label}
              aria-expanded={isPartnerInfoOpen}
              aria-controls="partner-info-tooltip"
              onClick={() => setIsPartnerInfoOpen((prev) => !prev)}
              onBlur={() => setIsPartnerInfoOpen(false)}
              className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-teal/35 text-teal text-xs font-bold cursor-pointer"
            >
              i
            </button>
            {isPartnerInfoOpen && (
              <div
                id="partner-info-tooltip"
                role="tooltip"
                className="absolute left-0 top-7 z-20 w-64 rounded-lg border border-teal/20 bg-white p-3 text-xs text-text-muted shadow-lg"
              >
                {i18n.registration.partner_info_text}
              </div>
            )}
          </div>
        </div>
        <input
          id="partner_name"
          type="text"
          value={partnerName}
          onChange={(e) => setPartnerName(e.target.value)}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          className="w-full border border-bg-warm rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none bg-bg/50"
        />
      </div>

      {/* Comment */}
      <div className="mb-6">
        <label htmlFor="comment" className="block text-sm font-medium mb-1">{i18n.registration.comment}</label>
        <textarea
          id="comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          className="w-full border border-bg-warm rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none bg-bg/50 resize-y"
        />
      </div>

      {/* Result Messages */}
      {results.length > 0 && (
        <div
          ref={resultContainerRef}
          tabIndex={-1}
          className="mb-4 space-y-2 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl"
        >
          {results.map((r) => (
            <div
              key={r.classId}
              className={`p-3 rounded-xl text-sm ${
                r.type === 'success' ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-error border border-red-200'
              }`}
            >
              <div className="font-semibold mb-0.5">
                {r.type === 'success' ? i18n.registration.success_title : i18n.registration.error_title}: {r.className}
              </div>
              {r.message}
            </div>
          ))}
        </div>
      )}

      {/* Privacy consent */}
      <div className="mb-4">
        <label className="flex items-start gap-2.5 cursor-pointer text-sm text-text">
          <input
            type="checkbox"
            checked={privacyConsent}
            onChange={(e) => {
              setPrivacyConsent(e.target.checked);
              if (e.target.checked) setPrivacyError(false);
            }}
            className={`w-4 h-4 mt-0.5 rounded accent-teal shrink-0 ${privacyError ? 'outline outline-2 outline-error rounded' : ''}`}
            aria-invalid={privacyError}
            aria-describedby={privacyError ? 'privacy-consent-error' : undefined}
          />
          <span className="leading-snug">
            {i18n.registration.privacy_consent_before}
            <a
              href={locale === 'de' ? '/de/datenschutz' : '/en/privacy'}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary-dark"
              onClick={(e) => e.stopPropagation()}
            >
              {i18n.registration.privacy_consent_link}
            </a>
            {i18n.registration.privacy_consent_after}
            <span className="text-coral"> *</span>
          </span>
        </label>
        {privacyError && (
          <p id="privacy-consent-error" className="mt-1.5 text-xs text-error" role="alert">
            {i18n.registration.privacy_consent_required}
          </p>
        )}
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || !isFormValid}
        className="w-full bg-coral hover:bg-coral-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-full transition-colors shadow-md shadow-coral/20"
      >
        {submitting ? i18n.registration.submitting : i18n.registration.submit}
      </button>
    </form>
  );
}
