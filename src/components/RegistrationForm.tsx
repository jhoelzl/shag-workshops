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
  preselectedClassId?: string | null;
}

export default function RegistrationForm({ locale, danceClasses, supabaseFunctionsUrl, supabaseAnonKey, preselectedClassId }: Props) {
  const i18n = translations[locale];

  const [selectedClass, setSelectedClass] = useState(preselectedClassId || '');
  const [role, setRole] = useState<'lead' | 'follow'>('lead');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Sync when preselectedClassId changes
  useEffect(() => {
    if (preselectedClassId) setSelectedClass(preselectedClassId);
  }, [preselectedClassId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch(`${supabaseFunctionsUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          dance_class_id: selectedClass,
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
        if (data.code === 'DUPLICATE') {
          setResult({ type: 'error', message: i18n.registration.error_duplicate });
        } else if (data.code === 'CLOSED') {
          setResult({ type: 'error', message: i18n.registration.error_closed });
        } else if (data.code === 'VALIDATION') {
          setResult({ type: 'error', message: i18n.registration.error_validation });
        } else {
          setResult({ type: 'error', message: data.message || data.error || i18n.registration.error_generic });
        }
      } else {
        setResult({ type: 'success', message: i18n.registration.success_message });
        setName('');
        setEmail('');
        setPartnerName('');
        setComment('');
      }
    } catch {
      setResult({ type: 'error', message: i18n.registration.error_generic });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-surface rounded-2xl shadow-lg border border-bg-warm p-6 max-w-lg">
      <h2 className="font-display text-2xl font-bold text-primary mb-6">{i18n.registration.title}</h2>

      {/* Dance Class Selection */}
      <div className="mb-4">
        <label htmlFor="dance_class" className="block text-sm font-medium mb-1">{i18n.registration.dance_class}</label>
        <select
          id="dance_class"
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          required
          className="w-full border border-bg-warm rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-teal/30 focus:border-teal outline-none bg-bg/50"
        >
          <option value="">—</option>
          {danceClasses.map((dc) => (
            <option key={dc.id} value={dc.id}>
              {locale === 'de' ? dc.title_de : dc.title_en}
              {dc.level ? ` (${dc.level})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Role */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-2">{i18n.registration.role}</label>
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
        <label htmlFor="name" className="block text-sm font-medium mb-1">{i18n.registration.name}</label>
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
        <label htmlFor="email" className="block text-sm font-medium mb-1">{i18n.registration.email}</label>
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

      {/* Result Message */}
      {result && (
        <div className={`mb-4 p-4 rounded-xl text-sm ${result.type === 'success' ? 'bg-green-50 text-success border border-green-200' : 'bg-red-50 text-error border border-red-200'}`}>
          <div className="font-semibold mb-1">
            {result.type === 'success' ? i18n.registration.success_title : i18n.registration.error_title}
          </div>
          {result.message}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full bg-coral hover:bg-coral-dark disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-full transition-colors shadow-md shadow-coral/20"
      >
        {submitting ? i18n.registration.submitting : i18n.registration.submit}
      </button>
    </form>
  );
}
