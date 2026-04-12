import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the registration Edge Function business logic.
 *
 * Since the Edge Function is a Deno handler, we replicate the core logic here
 * and test it thoroughly. This validates the same validation rules, capacity
 * checks, and status assignment logic used in production.
 */

// ── Re-implement the core logic extracted from register/index.ts ──

interface RegisterInput {
  dance_class_id?: string;
  role?: string;
  name?: string;
  email?: string;
  partner_name?: string;
  comment?: string;
  locale?: string;
}

interface DanceClass {
  id: string;
  title_de: string;
  title_en: string;
  max_leads: number;
  max_follows: number;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
}

interface RegistrationCounts {
  dance_class_id: string;
  leads_available: number;
  follows_available: number;
}

interface SupabaseMock {
  findClass: (id: string) => DanceClass | null;
  findDuplicate: (classId: string, email: string) => boolean;
  getCounts: (classId: string) => RegistrationCounts | null;
  insertRegistration: (data: Record<string, unknown>) => { id: string } | null;
}

type RegistrationResult =
  | { error: string; code: string; status: number }
  | { success: true; registration_status: string; id: string; status: number };

function processRegistration(
  input: RegisterInput,
  db: SupabaseMock,
  now: Date,
): RegistrationResult {
  const { dance_class_id, role, name, email, partner_name, comment } = input;

  // Input validation
  if (!dance_class_id || !role || !name || !email) {
    return { error: 'Missing required fields', code: 'VALIDATION', status: 400 };
  }

  if (!['lead', 'follow'].includes(role)) {
    return { error: 'Invalid role', code: 'VALIDATION', status: 400 };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { error: 'Invalid email', code: 'VALIDATION', status: 400 };
  }

  // Check class exists
  const danceClass = db.findClass(dance_class_id);
  if (!danceClass) {
    return { error: 'Dance class not found', code: 'NOT_FOUND', status: 404 };
  }

  // Check registration window
  if (danceClass.registration_opens_at && new Date(danceClass.registration_opens_at) > now) {
    return { error: 'Registration is closed', code: 'CLOSED', status: 400 };
  }

  if (danceClass.registration_closes_at && new Date(danceClass.registration_closes_at) < now) {
    return { error: 'Registration deadline has passed', code: 'CLOSED', status: 400 };
  }

  // Check duplicate
  const normalizedEmail = email.toLowerCase().trim();
  if (db.findDuplicate(dance_class_id, normalizedEmail)) {
    return { error: 'Already registered', code: 'DUPLICATE', status: 409 };
  }

  // Check capacity
  const counts = db.getCounts(dance_class_id);
  const roleField = role === 'lead' ? 'leads_available' : 'follows_available';
  const spotsAvailable = counts
    ? Number(counts[roleField])
    : (role === 'lead' ? danceClass.max_leads : danceClass.max_follows);
  const regStatus = spotsAvailable > 0 ? 'pending' : 'waitlisted';

  // Insert registration
  const registration = db.insertRegistration({
    dance_class_id,
    email: normalizedEmail,
    name: name.trim(),
    role,
    partner_name: partner_name?.trim() || null,
    comment: comment?.trim() || null,
    status: regStatus,
  });

  if (!registration) {
    return { error: 'Registration failed', code: 'INSERT_ERROR', status: 500 };
  }

  return { success: true, registration_status: regStatus, id: registration.id, status: 201 };
}

// ── Tests ──

const CLASS_OPEN: DanceClass = {
  id: 'class-1',
  title_de: 'Shag Basics',
  title_en: 'Shag Basics',
  max_leads: 10,
  max_follows: 10,
  registration_opens_at: '2025-01-01T00:00:00Z',
  registration_closes_at: '2025-12-31T23:59:59Z',
};

function makeDb(overrides: Partial<SupabaseMock> = {}): SupabaseMock {
  return {
    findClass: () => CLASS_OPEN,
    findDuplicate: () => false,
    getCounts: () => ({ dance_class_id: 'class-1', leads_available: 5, follows_available: 5 }),
    insertRegistration: (data) => ({ id: 'reg-123' }),
    ...overrides,
  };
}

const NOW = new Date('2025-06-15T12:00:00Z');

const VALID_INPUT: RegisterInput = {
  dance_class_id: 'class-1',
  role: 'lead',
  name: 'Max Mustermann',
  email: 'max@example.com',
  locale: 'de',
};

describe('Registration: Input validation', () => {
  it('rejects missing dance_class_id', () => {
    const result = processRegistration({ ...VALID_INPUT, dance_class_id: undefined }, makeDb(), NOW);
    expect(result).toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('rejects missing role', () => {
    const result = processRegistration({ ...VALID_INPUT, role: undefined }, makeDb(), NOW);
    expect(result).toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('rejects missing name', () => {
    const result = processRegistration({ ...VALID_INPUT, name: undefined }, makeDb(), NOW);
    expect(result).toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('rejects missing email', () => {
    const result = processRegistration({ ...VALID_INPUT, email: undefined }, makeDb(), NOW);
    expect(result).toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('rejects invalid role', () => {
    const result = processRegistration({ ...VALID_INPUT, role: 'dancer' }, makeDb(), NOW);
    expect(result).toMatchObject({ code: 'VALIDATION', status: 400, error: 'Invalid role' });
  });

  it('rejects invalid email format', () => {
    const result = processRegistration({ ...VALID_INPUT, email: 'not-an-email' }, makeDb(), NOW);
    expect(result).toMatchObject({ code: 'VALIDATION', status: 400, error: 'Invalid email' });
  });

  it('rejects email without domain', () => {
    const result = processRegistration({ ...VALID_INPUT, email: 'user@' }, makeDb(), NOW);
    expect(result).toMatchObject({ code: 'VALIDATION', status: 400 });
  });

  it('accepts valid lead role', () => {
    const result = processRegistration({ ...VALID_INPUT, role: 'lead' }, makeDb(), NOW);
    expect(result).toMatchObject({ success: true });
  });

  it('accepts valid follow role', () => {
    const result = processRegistration({ ...VALID_INPUT, role: 'follow' }, makeDb(), NOW);
    expect(result).toMatchObject({ success: true });
  });
});

describe('Registration: Class lookup', () => {
  it('returns NOT_FOUND when class does not exist', () => {
    const db = makeDb({ findClass: () => null });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('Registration: Registration window', () => {
  it('rejects when registration has not opened yet', () => {
    const futureClass: DanceClass = {
      ...CLASS_OPEN,
      registration_opens_at: '2025-12-01T00:00:00Z',
    };
    const db = makeDb({ findClass: () => futureClass });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ code: 'CLOSED', status: 400, error: 'Registration is closed' });
  });

  it('rejects when registration deadline has passed', () => {
    const closedClass: DanceClass = {
      ...CLASS_OPEN,
      registration_closes_at: '2025-01-31T00:00:00Z',
    };
    const db = makeDb({ findClass: () => closedClass });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ code: 'CLOSED', status: 400 });
  });

  it('allows registration when no opens_at is set', () => {
    const noWindowClass: DanceClass = {
      ...CLASS_OPEN,
      registration_opens_at: null,
      registration_closes_at: null,
    };
    const db = makeDb({ findClass: () => noWindowClass });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ success: true });
  });

  it('allows registration when opens_at is in the past and no closes_at', () => {
    const openClass: DanceClass = {
      ...CLASS_OPEN,
      registration_opens_at: '2025-01-01T00:00:00Z',
      registration_closes_at: null,
    };
    const db = makeDb({ findClass: () => openClass });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ success: true });
  });
});

describe('Registration: Duplicate check', () => {
  it('rejects duplicate registration for same email and class', () => {
    const db = makeDb({ findDuplicate: () => true });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ code: 'DUPLICATE', status: 409 });
  });

  it('allows registration when no duplicate exists', () => {
    const db = makeDb({ findDuplicate: () => false });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ success: true });
  });
});

describe('Registration: Capacity & status assignment', () => {
  it('assigns "pending" when lead spots are available', () => {
    const db = makeDb({
      getCounts: () => ({ dance_class_id: 'class-1', leads_available: 3, follows_available: 5 }),
    });
    const result = processRegistration({ ...VALID_INPUT, role: 'lead' }, db, NOW);
    expect(result).toMatchObject({ success: true, registration_status: 'pending' });
  });

  it('assigns "waitlisted" when lead spots are 0', () => {
    const db = makeDb({
      getCounts: () => ({ dance_class_id: 'class-1', leads_available: 0, follows_available: 5 }),
    });
    const result = processRegistration({ ...VALID_INPUT, role: 'lead' }, db, NOW);
    expect(result).toMatchObject({ success: true, registration_status: 'waitlisted' });
  });

  it('assigns "pending" when follow spots are available', () => {
    const db = makeDb({
      getCounts: () => ({ dance_class_id: 'class-1', leads_available: 0, follows_available: 3 }),
    });
    const result = processRegistration({ ...VALID_INPUT, role: 'follow' }, db, NOW);
    expect(result).toMatchObject({ success: true, registration_status: 'pending' });
  });

  it('assigns "waitlisted" when follow spots are 0', () => {
    const db = makeDb({
      getCounts: () => ({ dance_class_id: 'class-1', leads_available: 5, follows_available: 0 }),
    });
    const result = processRegistration({ ...VALID_INPUT, role: 'follow' }, db, NOW);
    expect(result).toMatchObject({ success: true, registration_status: 'waitlisted' });
  });

  it('falls back to max_leads when counts view returns null', () => {
    const db = makeDb({ getCounts: () => null });
    const result = processRegistration({ ...VALID_INPUT, role: 'lead' }, db, NOW);
    // max_leads = 10 > 0, so should be pending
    expect(result).toMatchObject({ success: true, registration_status: 'pending' });
  });

  it('falls back to max_follows when counts view returns null', () => {
    const db = makeDb({ getCounts: () => null });
    const result = processRegistration({ ...VALID_INPUT, role: 'follow' }, db, NOW);
    // max_follows = 10 > 0, so should be pending
    expect(result).toMatchObject({ success: true, registration_status: 'pending' });
  });
});

describe('Registration: Insert failure', () => {
  it('returns INSERT_ERROR when insert fails', () => {
    const db = makeDb({ insertRegistration: () => null });
    const result = processRegistration(VALID_INPUT, db, NOW);
    expect(result).toMatchObject({ code: 'INSERT_ERROR', status: 500 });
  });
});

describe('Registration: Successful registration', () => {
  it('returns 201 with success, status, and id', () => {
    const result = processRegistration(VALID_INPUT, makeDb(), NOW);
    expect(result).toMatchObject({
      success: true,
      registration_status: 'pending',
      id: 'reg-123',
      status: 201,
    });
  });

  it('normalizes email to lowercase and trims', () => {
    const insertSpy = vi.fn().mockReturnValue({ id: 'reg-456' });
    const db = makeDb({ insertRegistration: insertSpy });
    processRegistration({ ...VALID_INPUT, email: 'Max@Example.COM' }, db, NOW);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'max@example.com' }),
    );
  });

  it('trims name', () => {
    const insertSpy = vi.fn().mockReturnValue({ id: 'reg-789' });
    const db = makeDb({ insertRegistration: insertSpy });
    processRegistration({ ...VALID_INPUT, name: '  Max Mustermann  ' }, db, NOW);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Max Mustermann' }),
    );
  });

  it('trims partner_name or sets null', () => {
    const insertSpy = vi.fn().mockReturnValue({ id: 'reg-a' });
    const db = makeDb({ insertRegistration: insertSpy });
    processRegistration({ ...VALID_INPUT, partner_name: '  Anna  ' }, db, NOW);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ partner_name: 'Anna' }),
    );
  });

  it('sets partner_name to null when empty', () => {
    const insertSpy = vi.fn().mockReturnValue({ id: 'reg-b' });
    const db = makeDb({ insertRegistration: insertSpy });
    processRegistration({ ...VALID_INPUT, partner_name: '' }, db, NOW);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ partner_name: null }),
    );
  });

  it('sets comment to null when not provided', () => {
    const insertSpy = vi.fn().mockReturnValue({ id: 'reg-c' });
    const db = makeDb({ insertRegistration: insertSpy });
    processRegistration({ ...VALID_INPUT }, db, NOW);
    expect(insertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ comment: null }),
    );
  });
});
