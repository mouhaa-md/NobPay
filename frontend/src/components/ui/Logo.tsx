/** NobPay wordmark: blue lightning bolt + "NobPay" (same mark as the Stitch logo). */
export function Logo({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 font-headline-md leading-none ${className}`}>
      <svg viewBox="0 0 24 24" className={`h-[1.15em] w-[1.15em] ${tone === 'light' ? 'text-white' : 'text-primary-container'}`} fill="currentColor" aria-hidden="true">
        <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
      </svg>
      <span className={`font-extrabold tracking-tight ${tone === 'light' ? 'text-white' : 'text-on-surface'}`}>
        Nob<span className={tone === 'light' ? 'text-tertiary-fixed-dim' : 'text-primary-container'}>Pay</span>
      </span>
    </span>
  );
}
