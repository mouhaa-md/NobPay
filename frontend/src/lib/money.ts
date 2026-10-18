// French number/date formatting. Amounts are always integer cents (USD).

const NBSP = ' ';

// fr-FR groups digits with a narrow no-break space (U+202F). The app fonts (Inter, Plus Jakarta Sans)
// have no glyph for it, so large amounts would render glued together: use a plain no-break space instead.
const groups = (s: string) => s.replace(/ /g, NBSP);

const num2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const num2max = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });

/** 1 520 000 (digit groups kept together) */
export function formatInt(n: number): string {
  return groups(num0.format(n));
}

/** 760 or 612,5 (exchange rates) */
export function formatRate(rate: number): string {
  return groups(num2max.format(rate));
}

/** 56 893,30 $ */
export function formatUsd(cents: number): string {
  return `${groups(num2.format(cents / 100))}${NBSP}$`;
}

/** 24 000 $ (no decimals when the amount is round) */
export function formatUsdShort(cents: number): string {
  const whole = cents % 100 === 0;
  return `${groups((whole ? num0 : num2).format(cents / 100))}${NBSP}$`;
}

/** 1 520 000 FCFA */
export function formatFcfa(amount: number): string {
  return `${groups(num0.format(Math.round(amount)))}${NBSP}FCFA`;
}

/** 2 500 sats */
export function formatSats(sats: number): string {
  return `${groups(num0.format(Math.round(sats)))}${NBSP}sats`;
}

export function formatBtc(btc: number): string {
  return `${btc.toFixed(8).replace(/0+$/, '').replace(/\.$/, '')}${NBSP}BTC`;
}

export function usdToFcfa(cents: number, rate: number): number {
  return Math.round((cents / 100) * rate);
}

export function usdToSats(cents: number, btcUsd: number): number {
  return Math.max(1, Math.round((cents / 100 / btcUsd) * 1e8));
}

export function parseUsdToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.,]/g, '').replace(',', '.');
  const value = Number.parseFloat(cleaned);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export function formatDateTime(iso: string): string {
  return dateTimeFmt.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** « il y a 3 jours », « hier, 18:30 », « aujourd'hui, 11:05 » */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days <= 0) return `Aujourd'hui, ${time}`;
  if (days === 1) return `Hier, ${time}`;
  if (days < 7) return `Il y a ${days} jours`;
  return formatDate(iso);
}

export function initials(first: string, last = ''): string {
  return `${first.trim().charAt(0)}${last.trim().charAt(0)}`.toUpperCase() || first.trim().slice(0, 2).toUpperCase();
}
