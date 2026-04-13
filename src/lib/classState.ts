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
