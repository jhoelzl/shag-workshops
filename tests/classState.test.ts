import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getClassState } from '../src/lib/classState';
import type { ClassSession } from '../src/lib/database.types';

function makeSession(date: string): ClassSession {
  return {
    id: crypto.randomUUID(),
    dance_class_id: 'class-1',
    session_date: date,
    start_time: '18:00',
    end_time: '19:30',
    note: null,
    created_at: new Date().toISOString(),
  };
}

describe('getClassState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "archived" when all sessions are in the past', () => {
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const sessions = [makeSession('2025-06-01'), makeSession('2025-06-10')];
    expect(getClassState(sessions, null, null)).toBe('archived');
  });

  it('returns "upcoming" when registration has no opens_at and sessions are in the future', () => {
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const sessions = [makeSession('2025-07-01')];
    expect(getClassState(sessions, null, null)).toBe('upcoming');
  });

  it('returns "upcoming" when registration opens_at is in the future', () => {
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const sessions = [makeSession('2025-07-15')];
    expect(getClassState(sessions, '2025-07-01T00:00:00Z', null)).toBe('upcoming');
  });

  it('returns "open" when now is after opens_at and no closes_at', () => {
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const sessions = [makeSession('2025-07-01')];
    expect(getClassState(sessions, '2025-06-01T00:00:00Z', null)).toBe('open');
  });

  it('returns "open" when now is between opens_at and closes_at', () => {
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const sessions = [makeSession('2025-07-01')];
    expect(getClassState(sessions, '2025-06-01T00:00:00Z', '2025-06-30T23:59:59Z')).toBe('open');
  });

  it('returns "ongoing" when now is past closes_at but sessions are still upcoming', () => {
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    const sessions = [makeSession('2025-07-01')];
    expect(getClassState(sessions, '2025-05-01T00:00:00Z', '2025-06-10T00:00:00Z')).toBe('ongoing');
  });

  it('returns "upcoming" when no sessions exist', () => {
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
    expect(getClassState([], null, null)).toBe('upcoming');
  });
});
