export const APP_TZ = 'Asia/Kolkata' as const;

export function formatIST(d: Date | string | number | null | undefined, withTime = false): string {
  if (d == null || d === '') return '—';
  const opts: Intl.DateTimeFormatOptions = { timeZone: APP_TZ, day: '2-digit', month: 'short', year: 'numeric' };
  if (withTime) Object.assign(opts, { hour: '2-digit', minute: '2-digit', hour12: true });
  return new Intl.DateTimeFormat('en-IN', opts).format(new Date(d as any)) + (withTime ? ' IST' : '');
}

export const istDateKey = (d: Date | string | number = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: APP_TZ }).format(new Date(d as any));

export const startOfDayIST = (key: string) => new Date(`${key}T00:00:00+05:30`);
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
