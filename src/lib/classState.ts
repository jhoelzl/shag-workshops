import type { ClassSession } from './database.types';

export type ClassState = 'upcoming' | 'open' | 'ongoing' | 'archived';

/**
 * Derive class state from session dates and registration window.
 * - archived: all sessions are in the past
 * - open: registration window is active (opens_at <= now <= closes_at)
 * - ongoing: registration is closed but sessions are still running/upcoming
 * - upcoming: has future sessions but registration not yet open
 */
export function getClassState(
  sessions: ClassSession[],
  registration_opens_at: string | null | undefined,
  registration_closes_at: string | null | undefined,
): ClassState {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Check if all sessions are in the past
  const hasFutureSessions = sessions.some((s) => s.session_date >= today);
  if (!hasFutureSessions && sessions.length > 0) {
    return 'archived';
  }

  // Check if registration is open
  const opensAt = registration_opens_at ? new Date(registration_opens_at) : null;
  const closesAt = registration_closes_at ? new Date(registration_closes_at) : null;

  if (opensAt && now >= opensAt) {
    if (!closesAt || now <= closesAt) {
      return 'open';
    }
    // Past closes_at but still has future/current sessions
    return 'ongoing';
  }

  return 'upcoming';
}

export type JourneyStage = 'draft' | 'preview' | 'upcoming' | 'open' | 'ongoing' | 'archived';

export const JOURNEY_STAGES: JourneyStage[] = ['draft', 'preview', 'upcoming', 'open', 'ongoing', 'archived'];

/** Full admin-facing lifecycle stage: draft → preview → upcoming → open → ongoing → archived. */
export function getJourneyStage(
  cls: {
    is_public: boolean;
    is_preview?: boolean | null;
    registration_opens_at?: string | null;
    registration_closes_at?: string | null;
  },
  sessions: ClassSession[],
): JourneyStage {
  if (!cls.is_public) return 'draft';
  if (cls.is_preview) return 'preview';
  return getClassState(sessions, cls.registration_opens_at, cls.registration_closes_at);
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Short "what happens next" hint for a class in the given stage. */
export function getNextHint(
  stage: JourneyStage,
  cls: { registration_opens_at?: string | null; registration_closes_at?: string | null },
  sessions: ClassSession[],
): string {
  const dates = sessions.map((s) => s.session_date).sort();
  const last = dates[dates.length - 1];
  switch (stage) {
    case 'draft':
      return 'Next: publish as preview to show it to students';
    case 'preview':
      return 'Next: publish to show the full class details on the website';
    case 'upcoming':
      return cls.registration_opens_at
        ? `Next: registration opens ${fmtDate(cls.registration_opens_at)}`
        : 'Next: set a registration opening date';
    case 'open':
      return cls.registration_closes_at
        ? `Next: registration closes ${fmtDate(cls.registration_closes_at)}`
        : 'Next: registration stays open until you close it';
    case 'ongoing':
      return last ? `Next: archived after last session (${fmtDate(last)})` : 'Next: archived after last session';
    case 'archived':
      return last ? `Finished ${fmtDate(last)}` : 'Finished';
  }
}
