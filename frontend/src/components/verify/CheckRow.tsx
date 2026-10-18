import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/primitives';

export type CheckState = 'ok' | 'bad' | 'wait' | 'pending' | 'idle';

const LOOK: Record<CheckState, string> = {
  ok: 'bg-[#16A34A] text-white',
  bad: 'bg-error text-on-error',
  wait: 'bg-primary-container text-on-primary',
  pending: 'bg-[#F59E0B] text-white',
  idle: 'bg-surface-container-high text-on-surface-variant',
};

/** One line of the verification checklist. */
export function CheckRow({ state, title, children }: { state: CheckState; title: string; children?: ReactNode }) {
  return (
    <li className="flex gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm ring-1 ring-outline-variant/30">
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${LOOK[state]}`}>
        {state === 'ok' ? <Icon name="check" size={17} /> : state === 'bad' ? <Icon name="close" size={17} /> : state === 'wait' ? <Spinner className="h-4 w-4" /> : state === 'pending' ? <Icon name="hourglass_top" size={16} /> : <Icon name="remove" size={16} />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-title-md text-title-md">{title}</p>
        {children && <div className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">{children}</div>}
      </div>
    </li>
  );
}
