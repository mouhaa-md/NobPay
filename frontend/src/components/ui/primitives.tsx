import type { ReactNode } from 'react';
import { initials } from '@/lib/money';
import { Icon } from './Icon';

const AVATAR_GRADIENTS = [
  'from-[#1E3A8A] to-[#3B82F6]',
  'from-[#047857] to-[#10B981]',
  'from-[#9333EA] to-[#C084FC]',
  'from-[#D97706] to-[#FBBF24]',
  'from-[#EA580C] to-[#F97316]',
];

export function Avatar({ first, last = '', size = 'md', status }: { first: string; last?: string; size?: 'sm' | 'md' | 'lg'; status?: 'online' | 'pending' }) {
  const hash = [...(first + last)].reduce((h, c) => h + c.charCodeAt(0), 0);
  const dim = size === 'lg' ? 'h-14 w-14 text-title-md' : size === 'sm' ? 'h-8 w-8 text-label-md' : 'h-11 w-11 text-title-md';
  return (
    <span className="relative inline-block shrink-0">
      <span className={`${dim} flex items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]} font-title-md text-white shadow-md`}>
        {initials(first, last)}
      </span>
      {status && (
        <span className={`absolute rounded-full ring-2 ring-white ${size === 'sm' ? '-bottom-0.5 -right-0.5 h-2.5 w-2.5' : 'bottom-0 right-0 h-3.5 w-3.5'} ${status === 'online' ? 'bg-[#16A34A]' : 'bg-[#F59E0B]'}`} />
      )}
    </span>
  );
}

const TONES = {
  neutral: 'bg-surface-container text-on-surface-variant',
  primary: 'bg-surface-container text-primary',
  success: 'bg-[#DCFCE7] text-[#15803D]',
  warning: 'bg-[#FEF3C7] text-[#B45309]',
  accent: 'bg-tertiary-fixed text-on-tertiary-fixed',
  danger: 'bg-error-container text-on-error-container',
  dark: 'bg-primary/40 text-on-primary',
} as const;

export function Chip({ tone = 'neutral', icon, children, className = '' }: { tone?: keyof typeof TONES; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-label-sm text-label-sm ${TONES[tone]} ${className}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}

export function ProgressBar({ value, className = '' }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={`h-2 w-full overflow-hidden rounded-full bg-surface-container-high ${className}`}
    >
      <div className="h-full rounded-full bg-primary-container transition-all duration-700" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" />
    </svg>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="font-title-md text-title-md text-on-surface">{children}</h2>
      {action}
    </div>
  );
}

/** Primary pill button used for the main action of a screen. */
export const buttonPrimary =
  'flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-primary-container font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25 transition active:scale-[0.98] hover:bg-primary disabled:cursor-not-allowed disabled:opacity-50';
export const buttonSecondary =
  'flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-surface-container-low font-label-lg text-label-lg font-semibold text-on-surface transition active:scale-[0.98] hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50';
export const buttonGhost =
  'flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-surface-container-lowest font-label-lg text-label-lg font-semibold text-on-surface shadow-sm ring-1 ring-outline-variant/40 transition active:scale-[0.98] hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-50';

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-2xl bg-error-container px-3 py-2 font-body-sm text-body-sm text-on-error-container">
      <Icon name="error" size={18} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  );
}
