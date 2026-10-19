const APP_TZ = 'Asia/Kolkata';

/** "YYYY-MM-DD" in IST for the given date (defaults to now) */
export function istDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(d);
}

/** "19 Oct 2026, 04:15 PM IST" */
export function formatIST(d: Date = new Date()): string {
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: APP_TZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(d) + ' IST'
  );
}
