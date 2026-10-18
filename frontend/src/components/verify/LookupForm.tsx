'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote } from '@/components/ui/primitives';

/** Accepts a full verification link or just its identifier. */
export function LookupForm() {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const id = value.trim().split(/[/?#]/).filter(Boolean).pop() ?? '';
        if (!/^a_[0-9a-f]{8,}$/i.test(id)) return setError('Identifiant non reconnu. Il ressemble à « a_1b2c3d4e5f6a7b8c ».');
        setError('');
        router.push(`/verifier/${id}`);
      }}
    >
      <label className="flex flex-col gap-1.5 font-label-md text-label-md text-on-surface-variant">
        Lien ou identifiant d&apos;un ancrage
        <span className="flex items-center gap-2 rounded-2xl bg-surface-container-low p-1.5 focus-within:bg-surface-container-lowest focus-within:ring-2 focus-within:ring-primary-container">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-10 w-full bg-transparent px-3 font-body-md text-on-surface outline-none placeholder:text-outline"
            placeholder="https://…/verifier/a_1b2c3d4e5f6a7b8c"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" aria-label="Vérifier" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-container text-on-primary transition active:scale-95">
            <Icon name="arrow_forward" size={20} />
          </button>
        </span>
      </label>
      <ErrorNote>{error}</ErrorNote>
    </form>
  );
}
