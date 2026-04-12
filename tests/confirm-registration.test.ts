import { describe, it, expect, vi } from 'vitest';

/**
 * Tests for the confirm-registration Edge Function business logic.
 *
 * Mirrors the logic in supabase/functions/confirm-registration/index.ts
 * with dependency injection for testability.
 */

// ── Re-implement the core logic extracted from confirm-registration/index.ts ──

interface ConfirmInput {
  registration_id?: string;
  new_status?: string;
}

interface Registration {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  dance_classes: {
    title_de: string;
    title_en: string;
  };
}

interface DbMock {
  getUser: () => { id: string } | null;
  findRegistration: (id: string) => Registration | null;
  updateStatus: (id: string, status: string) => boolean;
}

type ConfirmResult =
  | { error: string; status: number }
  | { success: true; status: number };

function processConfirmation(
  input: ConfirmInput,
  db: DbMock,
  hasAuthHeader: boolean,
): ConfirmResult {
  // Verify admin auth
  if (!hasAuthHeader) {
    return { error: 'Unauthorized', status: 401 };
  }

  const user = db.getUser();
  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }

  const { registration_id, new_status } = input;

  // Validate required fields
  if (!registration_id || !new_status) {
    return { error: 'Missing required fields', status: 400 };
  }

  // Validate status value
  if (!['confirmed', 'waitlisted', 'cancelled'].includes(new_status)) {
    return { error: 'Invalid status', status: 400 };
  }

  // Get registration
  const registration = db.findRegistration(registration_id);
  if (!registration) {
    return { error: 'Registration not found', status: 404 };
  }

  // Update status
  const updated = db.updateStatus(registration_id, new_status);
  if (!updated) {
    return { error: 'Update failed', status: 500 };
  }

  return { success: true, status: 200 };
}

// ── Email subject/body logic (tested separately) ──

function getEmailSubject(
  newStatus: string,
  titleDe: string,
  titleEn: string,
  lang: 'de' | 'en' = 'de',
): string {
  const subjects: Record<string, { de: string; en: string }> = {
    confirmed: { de: `Bestätigt: ${titleDe}`, en: `Confirmed: ${titleEn}` },
    waitlisted: { de: `Warteliste: ${titleDe}`, en: `Waitlisted: ${titleEn}` },
    cancelled: { de: `Abgesagt: ${titleDe}`, en: `Cancelled: ${titleEn}` },
  };
  return subjects[newStatus][lang];
}

// ── Tests ──

const VALID_REGISTRATION: Registration = {
  id: 'reg-1',
  name: 'Max Mustermann',
  email: 'max@example.com',
  role: 'lead',
  status: 'pending',
  dance_classes: {
    title_de: 'Shag Basics',
    title_en: 'Shag Basics',
  },
};

function makeDb(overrides: Partial<DbMock> = {}): DbMock {
  return {
    getUser: () => ({ id: 'admin-1' }),
    findRegistration: () => VALID_REGISTRATION,
    updateStatus: () => true,
    ...overrides,
  };
}

describe('Confirm Registration: Authentication', () => {
  it('rejects when no auth header is present', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'confirmed' },
      makeDb(),
      false,
    );
    expect(result).toMatchObject({ error: 'Unauthorized', status: 401 });
  });

  it('rejects when getUser returns null (invalid token)', () => {
    const db = makeDb({ getUser: () => null });
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'confirmed' },
      db,
      true,
    );
    expect(result).toMatchObject({ error: 'Unauthorized', status: 401 });
  });

  it('allows request when user is authenticated', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'confirmed' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ success: true, status: 200 });
  });
});

describe('Confirm Registration: Input validation', () => {
  it('rejects missing registration_id', () => {
    const result = processConfirmation(
      { new_status: 'confirmed' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ error: 'Missing required fields', status: 400 });
  });

  it('rejects missing new_status', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ error: 'Missing required fields', status: 400 });
  });

  it('rejects invalid status value "approved"', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'approved' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ error: 'Invalid status', status: 400 });
  });

  it('rejects invalid status value "pending"', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'pending' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ error: 'Invalid status', status: 400 });
  });

  it('rejects empty string for status', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: '' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ error: 'Missing required fields', status: 400 });
  });
});

describe('Confirm Registration: Status transitions', () => {
  it('allows transition to "confirmed"', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'confirmed' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ success: true, status: 200 });
  });

  it('allows transition to "waitlisted"', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'waitlisted' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ success: true, status: 200 });
  });

  it('allows transition to "cancelled"', () => {
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'cancelled' },
      makeDb(),
      true,
    );
    expect(result).toMatchObject({ success: true, status: 200 });
  });

  it('calls updateStatus with correct id and status', () => {
    const updateSpy = vi.fn().mockReturnValue(true);
    const db = makeDb({ updateStatus: updateSpy });
    processConfirmation(
      { registration_id: 'reg-1', new_status: 'cancelled' },
      db,
      true,
    );
    expect(updateSpy).toHaveBeenCalledWith('reg-1', 'cancelled');
  });
});

describe('Confirm Registration: Registration lookup', () => {
  it('returns 404 when registration not found', () => {
    const db = makeDb({ findRegistration: () => null });
    const result = processConfirmation(
      { registration_id: 'nonexistent', new_status: 'confirmed' },
      db,
      true,
    );
    expect(result).toMatchObject({ error: 'Registration not found', status: 404 });
  });
});

describe('Confirm Registration: Update failure', () => {
  it('returns 500 when update fails', () => {
    const db = makeDb({ updateStatus: () => false });
    const result = processConfirmation(
      { registration_id: 'reg-1', new_status: 'confirmed' },
      db,
      true,
    );
    expect(result).toMatchObject({ error: 'Update failed', status: 500 });
  });
});

describe('Confirm Registration: Email subjects', () => {
  it('generates correct German subject for confirmed', () => {
    expect(getEmailSubject('confirmed', 'Shag Basics', 'Shag Basics EN', 'de'))
      .toBe('Bestätigt: Shag Basics');
  });

  it('generates correct English subject for confirmed', () => {
    expect(getEmailSubject('confirmed', 'Shag Basics', 'Shag Basics EN', 'en'))
      .toBe('Confirmed: Shag Basics EN');
  });

  it('generates correct German subject for waitlisted', () => {
    expect(getEmailSubject('waitlisted', 'Shag Basics', 'Shag Basics EN', 'de'))
      .toBe('Warteliste: Shag Basics');
  });

  it('generates correct English subject for waitlisted', () => {
    expect(getEmailSubject('waitlisted', 'Shag Basics', 'Shag Basics EN', 'en'))
      .toBe('Waitlisted: Shag Basics EN');
  });

  it('generates correct German subject for cancelled', () => {
    expect(getEmailSubject('cancelled', 'Shag Basics', 'Shag Basics EN', 'de'))
      .toBe('Abgesagt: Shag Basics');
  });

  it('generates correct English subject for cancelled', () => {
    expect(getEmailSubject('cancelled', 'Shag Basics', 'Shag Basics EN', 'en'))
      .toBe('Cancelled: Shag Basics EN');
  });

  it('defaults to German when no lang specified', () => {
    expect(getEmailSubject('confirmed', 'Shag Basics', 'Shag Basics EN'))
      .toBe('Bestätigt: Shag Basics');
  });
});
