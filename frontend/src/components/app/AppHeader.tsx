import Link from 'next/link';
import { Avatar } from '@/components/ui/primitives';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { DesktopTopbar } from './DesktopTopbar';

/** Header of the tab screens: fixed bar on phones (logo, title, profile), top bar of the sidebar layout on a computer. */
export function AppHeader({ title, user }: { title: string; user: { firstName: string; lastName: string } }) {
  return (
    <>
      <header className="pt-safe fixed left-1/2 top-0 z-50 w-full max-w-[480px] -translate-x-1/2 bg-surface-container-lowest/80 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center justify-between px-space-md">
          <Link href="/app/accueil" aria-label="NobPay, accueil">
            <Logo className="text-[18px]" />
          </Link>
          <h1 className="font-title-md text-title-md text-on-surface">{title}</h1>
          <div className="flex items-center gap-1">
            <Link href="/app/notifications" aria-label="Notifications" className="flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container">
              <Icon name="notifications" size={22} />
            </Link>
            <Link href="/app/profil" aria-label="Profil">
              <Avatar first={user.firstName} last={user.lastName} size="sm" />
            </Link>
          </div>
        </div>
      </header>
      <DesktopTopbar title={title} />
    </>
  );
}

/** Header of the full-screen flows: back arrow and title (sticky on phones, top bar on a computer). */
export function FlowHeader({ title, backHref, right, standalone = false }: { title: string; backHref: string; right?: React.ReactNode; standalone?: boolean }) {
  return (
    <>
      <header className={`pt-safe sticky top-0 z-40 bg-surface-container-lowest/85 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl ${standalone ? '' : 'lg:hidden'}`}>
        <div className="flex h-16 items-center justify-between px-space-md">
          <Link href={backHref} aria-label="Retour" className="flex h-11 w-11 items-center justify-center rounded-full text-on-surface hover:bg-surface-container">
            <Icon name="arrow_back" />
          </Link>
          <h1 className="truncate px-2 font-title-md text-title-md text-on-surface">{title}</h1>
          <div className="flex h-11 w-11 items-center justify-center">{right}</div>
        </div>
      </header>
      {!standalone && <DesktopTopbar title={title} backHref={backHref} right={right} />}
    </>
  );
}
