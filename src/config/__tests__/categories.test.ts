import { describe, it, expect } from 'vitest';
import {
  getStatusOptions,
  isValidStatus,
  getDoneStatus,
  STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  IDEA_CATEGORIES,
} from '../categories';

describe('getStatusOptions', () => {
  it('returns Admin statuses', () => {
    expect(getStatusOptions('Admin')).toEqual(['Todo', 'Done']);
  });

  it('returns Projects statuses', () => {
    expect(getStatusOptions('Projects')).toEqual(['Not Started', 'Active', 'Waiting', 'Complete']);
  });

  it('returns People statuses', () => {
    expect(getStatusOptions('People')).toEqual(['New', 'Active', 'Dormant']);
  });

  it('returns Ideas statuses', () => {
    expect(getStatusOptions('Ideas')).toEqual(['Spark', 'Developing', 'Actionable']);
  });

  it('returns empty array for unknown database', () => {
    expect(getStatusOptions('Unknown')).toEqual([]);
  });
});

describe('isValidStatus', () => {
  it('validates correct Admin status', () => {
    expect(isValidStatus('Admin', 'Todo')).toBe(true);
    expect(isValidStatus('Admin', 'Done')).toBe(true);
  });

  it('rejects incorrect Admin status', () => {
    expect(isValidStatus('Admin', 'Active')).toBe(false);
  });

  it('validates correct Projects status', () => {
    expect(isValidStatus('Projects', 'Active')).toBe(true);
    expect(isValidStatus('Projects', 'Complete')).toBe(true);
  });
});

describe('getDoneStatus', () => {
  it('returns Done for Admin', () => {
    expect(getDoneStatus('Admin')).toBe('Done');
  });

  it('returns Complete for Projects', () => {
    expect(getDoneStatus('Projects')).toBe('Complete');
  });

  it('returns Dormant for People', () => {
    expect(getDoneStatus('People')).toBe('Dormant');
  });

  it('returns Done for unknown database', () => {
    expect(getDoneStatus('Ideas')).toBe('Done');
  });
});

describe('constants', () => {
  it('has all 4 database categories', () => {
    expect(Object.keys(STATUS_OPTIONS)).toHaveLength(4);
  });

  it('has 3 priority levels', () => {
    expect(PRIORITY_OPTIONS).toEqual(['High', 'Medium', 'Low']);
  });

  it('has 4 idea categories', () => {
    expect(IDEA_CATEGORIES).toEqual(['Business', 'Tech', 'Life', 'Creative']);
  });
});
