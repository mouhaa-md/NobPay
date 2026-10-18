'use client';

import { useRef } from 'react';

/** Six boxes, auto-advance, backspace goes back, paste of a whole code supported. */
export function OtpInput({ value, onChange, invalid = false }: { value: string; onChange: (v: string) => void; invalid?: boolean }) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  const set = (i: number, d: string) => {
    const next = digits.slice();
    next[i] = d;
    onChange(next.join('').slice(0, 6));
  };

  return (
    <div className="flex items-center justify-between gap-1.5" role="group" aria-label="Code de confirmation à 6 chiffres">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          value={d}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          aria-label={`Chiffre ${i + 1}`}
          className={`h-12 w-11 rounded-2xl bg-surface-container-lowest text-center font-headline-md text-headline-md text-primary outline-none ring-2 transition ${
            invalid ? 'ring-error' : d ? 'ring-primary-container' : 'ring-transparent focus:ring-primary-container'
          }`}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(-1);
            set(i, v);
            if (v && i < 5) refs.current[i + 1]?.focus();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (pasted) {
              e.preventDefault();
              onChange(pasted);
              refs.current[Math.min(pasted.length, 5)]?.focus();
            }
          }}
        />
      ))}
    </div>
  );
}
