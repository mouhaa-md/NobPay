import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';

/** Public pages: no account, no session. Wider than the phone column of the app. */
export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="pt-safe sticky top-0 z-40 border-b border-outline-variant/30 bg-surface-container-lowest/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between px-space-md">
          <Link href="/" aria-label="NobPay, accueil">
            <Logo className="text-[20px]" />
          </Link>
          <nav className="flex items-center gap-1 font-label-md text-label-md">
            <Link href="/verifier" className="rounded-full px-3 py-2 text-on-surface-variant hover:bg-surface-container">
              Vérifier
            </Link>
            <Link href="/app" className="inline-flex items-center gap-1.5 rounded-full bg-primary-container px-4 py-2 font-semibold text-on-primary shadow-sm transition hover:bg-primary">
              Ouvrir l&apos;app <Icon name="arrow_forward" size={16} />
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-space-md pb-20 pt-space-lg">{children}</main>
      <footer className="mx-auto max-w-2xl px-space-md pb-10 text-center font-label-sm text-label-sm text-on-surface-variant">
        Cette page ne demande aucun compte. Le code de NobPay est ouvert : vous pouvez relire la vérification.
      </footer>
    </div>
  );
}
