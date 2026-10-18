'use client';

import { Icon } from '@/components/ui/Icon';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'] as const;

/** On-screen numeric keypad (whole numbers). Keeps the system keyboard from covering the screen on phones. */
export function AmountKeypad({ value, onChange, maxDigits = 6 }: { value: string; onChange: (next: string) => void; maxDigits?: number }) {
  const press = (key: (typeof KEYS)[number]) => {
    if (key === 'back') return onChange(value.slice(0, -1));
    const next = `${value}${key}`.replace(/^0+/, '');
    if (next.length <= maxDigits) onChange(next);
  };
  return (
    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Clavier numérique">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          aria-label={key === 'back' ? 'Effacer' : key}
          onClick={() => press(key)}
          className="flex h-14 items-center justify-center rounded-2xl bg-surface-container-low font-headline-md text-headline-md text-on-surface transition hover:bg-surface-container active:scale-95 active:bg-surface-container-high"
        >
          {key === 'back' ? <Icon name="backspace" size={26} /> : key}
        </button>
      ))}
    </div>
  );
}
