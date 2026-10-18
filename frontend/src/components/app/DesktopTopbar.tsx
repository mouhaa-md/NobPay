import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';

/** Top bar of the computer layout: page title (with a back arrow on flow pages) and the notification bell. Hidden on phones. */
export function DesktopTopbar({ title, backHref, right }: { title: string; backHref?: string; right?: ReactNode }) {
  return (
    <header className="fixed left-[260px] right-0 top-0 z-40 hidden h-16 items-center justify-between bg-surface/80 px-8 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:flex">
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Link href={backHref} aria-label="Retour" className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface transition hover:bg-surface-container">
            <Icon name="arrow_back" />
          </Link>
        )}
        <h1 className="truncate font-title-lg text-title-lg text-on-surface">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {right}
        <Link href="/app/notifications" aria-label="Notifications" className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition hover:bg-surface-container">
          <Icon name="notifications" size={22} />
        </Link>
      </div>
    </header>
  );
}
