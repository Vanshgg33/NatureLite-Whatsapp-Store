export const APP_TZ = 'Asia/Kolkata' as const;

export function formatIST(d: Date | string | number | null | undefined, withTime = false): string {
  if (d == null || d === '') return '—';
  const opts: Intl.DateTimeFormatOptions = { timeZone: APP_TZ, day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: true });
  return new Intl.DateTimeFormat('en-IN', opts).format(new Date(d as any)) + (withTime ? ' IST' : '');
}

export const istDateKey = (d: Date | string | number = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(d as any));

/** IST "YYYY-MM-DD" for N days before today (default today). Replaces buggy toISOString().slice(0,10) which is UTC. */
export const istDaysAgoKey = (n = 0) => istDateKey(Date.now() - n * 86400000);
/** IST "YYYY-MM" */
export const istMonthKey = () => istDateKey().slice(0, 7);
/** IST Monday-or-Sunday week start key (sunday=true -> Sunday start). */
export function istWeekStartKey(sunday = false): string {
  const d = new Date(`${istDateKey()}T12:00:00Z`).getUTCDay(); // weekday of the IST calendar date
  const back = sunday ? d : (d + 6) % 7;
  return istDaysAgoKey(back);
}
/** IST "YYYY-MM-DDTHH:mm" for datetime-local inputs */
export const istDateTimeLocal = (d: Date | number = new Date()) =>
  new Intl.DateTimeFormat('sv-SE', { timeZone: APP_TZ, dateStyle: 'short', timeStyle: 'short' })
    .format(d).replace(' ', 'T');

/** Make every Date#toLocale*String default to IST so no screen shows browser-local time. Idempotent. */
export function installISTDefaults() {
  const P = Date.prototype as any;
  if (P.__istPatched) return;
  for (const m of ['toLocaleString', 'toLocaleDateString', 'toLocaleTimeString'] as const) {
    const orig = P[m];
    P[m] = function (loc?: any, opts?: Intl.DateTimeFormatOptions) {
      return orig.call(this, loc, opts?.timeZone ? opts : { ...opts, timeZone: APP_TZ });
    };
  }
  P.__istPatched = true;
}

export const startOfDayIST =(key: string) => new Date(`${key}T00:00:00+05:30`);
export const endOfDayIST   = (key: string) => new Date(`${key}T23:59:59.999+05:30`);
export const nowIST        = () => ({ date: new Date(), label: formatIST(new Date(), true), key: istDateKey() });

export function istGreeting(name?: string): string {
  const h = parseInt(
    new Intl.DateTimeFormat('en-IN', { timeZone: APP_TZ, hour: '2-digit', hour12: false }).format(new Date()),
    10,
  );
  const tod = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${tod}, ${name?.split(' ')[0] ?? 'there'}`;
}

export function istFullDate(): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  }).format(new Date());
}

export function istDayLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone: APP_TZ, month: 'short', day: 'numeric' }).format(d);
}
