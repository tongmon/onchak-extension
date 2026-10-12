export type AbrsLedgerUploadMode = 'daily' | 'monthly';

export interface AbrsLedgerPeriodSelection {
  mode: AbrsLedgerUploadMode;
  value: string;
  /** The receipt anchor is derived from the selected period, never edited separately. */
  targetDate: string;
  period: { start: string; end: string };
}

export function formatAbrsLedgerDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && formatAbrsLedgerDate(date) === value;
}

export function createAbrsLedgerPeriodSelection(
  mode: AbrsLedgerUploadMode,
  value: string,
): AbrsLedgerPeriodSelection | null {
  if (mode === 'daily') {
    return isCalendarDate(value)
      ? { mode, value, targetDate: value, period: { start: value, end: value } }
      : null;
  }

  if (!/^\d{4}-\d{2}$/.test(value) || !isCalendarDate(`${value}-01`)) return null;
  const first = new Date(`${value}-01T12:00:00`);
  const end = formatAbrsLedgerDate(new Date(first.getFullYear(), first.getMonth() + 1, 0));
  return { mode, value, targetDate: end, period: { start: `${value}-01`, end } };
}

export function defaultAbrsLedgerPeriodSelection(now = new Date()): AbrsLedgerPeriodSelection {
  const previousMonth = formatAbrsLedgerDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
  return createAbrsLedgerPeriodSelection('monthly', previousMonth)!;
}

/** Older cached target dates represented a month; retain that interpretation during migration. */
export function restoreAbrsLedgerPeriodSelection(
  stored: { targetDate: string; uploadMode?: AbrsLedgerUploadMode },
  now = new Date(),
): AbrsLedgerPeriodSelection {
  const mode = stored.uploadMode === 'daily' ? 'daily' : 'monthly';
  const value = mode === 'daily' ? stored.targetDate : stored.targetDate.slice(0, 7);
  return createAbrsLedgerPeriodSelection(mode, value) ?? defaultAbrsLedgerPeriodSelection(now);
}
