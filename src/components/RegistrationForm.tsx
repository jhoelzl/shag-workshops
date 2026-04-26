import { useState, useEffect } from 'react';
import type { DanceClass } from '../lib/database.types';
import type { Locale } from '../i18n/index';
import de from '../i18n/de.json';
import en from '../i18n/en.json';

const translations = { de, en };

interface Props {
  locale: Locale;
  danceClasses: DanceClass[];
  supabaseFunctionsUrl: string;
  supabaseAnonKey: string;
  preselectedClassIds?: string[];
}

type WorkshopResult = { classId: string; className: string; type: 'success' | 'error'; message: string };

export default function RegistrationForm({ locale, danceClasses, supabaseFunctionsUrl, supabaseAnonKey, preselectedClassIds }: Props) {
  const i18n = translations[locale];

  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(
    new Set(preselectedClassIds ?? [])
  );
  const [role, setRole] = useState<'lead' | 'follow'>('lead');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<WorkshopResult[]>([]);

  // Sync when preselectedClassIds changes (from card click in WorkshopPage)
  useEffect(() => {
    if (preselectedClassIds && preselectedClassIds.length > 0) {
      setSelectedClasses(new Set(preselectedClassIds));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(preselectedClassIds)]);

  function toggleClass(id: string) {
    setSelectedClasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedClasses.size === 0) return;

    setSubmitting(true);
    setResults([]);

    const newResults: WorkshopResult[] = [];

    for (const classId of Array.from(selectedClasses)) {
      const dc = danceClasses.find((c) => c.id === classId);
      const className = dc ? (locale === 'de' ? dc.title_de : dc.title_en) : classId;

      try {
        const response = await fetch(`${supabaseFunctionsUrl}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            dance_class_id: classId,
            role,
            name: name.trim(),
            email: email.trim().toLowerCase(),
            partner_name: partnerName.trim() || null,
            comment: comment.trim() || null,
            locale,
          }),
        });

        const data = await response.json();

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
          newResults.push({ classId, className, type: 'error', message });
        } else {
          newResults.push({ classId, className, type: 'success', message: i18n.registration.success_message });
        }
      } catch {
        newResults.push({ classId, className, type: 'error', message: i18n.registration.error_generic });
      }
    }

    setResults(newResults);

    // Clear personal details and deselect successfully registered workshops
    if (newResults.some((r) => r.type === 'success')) {
      setName('');
      setEmail('');
      setPartnerName('');
      setComment('');
      setSelectedClasses((prev) => {
        const next = new Set(prev);
        newResults.filter((r) => r.type === 'success').forEach((r) => next.delete(r.classId));
        return next;
      });
    }

    setSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-2xl shadow-lg border border-bg-warm p-6 max-w-lg">
      <h2 className="font-display text-2xl font-bold text-primary mb-6">{i18n.registration.title}</h2>

      {/* Dance Class Selection */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">{i18n.registration.dance_classes} <span className="text-coral">*</span></label>
        <div className="space-y-2">
          {danceClasses.map((dc) => {
            const title = locale === 'de' ? dc.title_de : dc.title_en;
            const isChecked = selectedClasses.has(dc.id);
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
                  onChange={() => toggleClass(dc.id)}
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
        <label className="block text-sm font-medium mb-2">{i18n.registration.role} <span className="text-coral">*</span></label>
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
          required
          className="w-full border border-bg-warm rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none bg-bg/50"
        />
      </div>

      {/* Email */}
      <div className="mb-4">
        <label htmlFor="email" className="block text-sm font-medium mb-1">{i18n.registration.email} <span className="text-coral">*</span></label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full border border-bg-warm rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none bg-bg/50"
        />
      </div>

      {/* Partner Name */}
      <div className="mb-4">
        <label htmlFor="partner_name" className="block text-sm font-medium mb-1">{i18n.registration.partner_name}</label>
        <input
          id="partner_name"
          type="text"
          value={partnerName}
          onChange={(e) => setPartnerName(e.target.value)}
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
        <div className="mb-4 space-y-2">
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

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting || selectedClasses.size === 0}
        className="w-full bg-coral hover:bg-coral-dark disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-full transition-colors shadow-md shadow-coral/20"
      >
        {submitting ? i18n.registration.submitting : i18n.registration.submit}
      </button>
    </form>
  );
}
