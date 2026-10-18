import { AuthForm } from '@/components/app/AuthForm';
import { FlowHeader } from '@/components/app/AppHeader';
import { DemoLoginButton } from '@/components/app/DemoLoginButton';

export const metadata = { title: 'Connexion' };

export default function Login() {
  return (
    <main className="flex min-h-screen flex-col">
      <FlowHeader title="Connexion" backHref="/app/bienvenue" />
      <section className="flex-1 px-space-md pb-space-xl pt-space-lg">
        <h2 className="mb-1 font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">Bon retour</h2>
        <p className="mb-space-lg font-body-md text-body-md text-on-surface-variant">Entrez votre numéro pour retrouver vos projets.</p>
        <AuthForm mode="login" />
        <div className="mt-space-lg border-t border-outline-variant/40 pt-space-lg">
          <DemoLoginButton />
        </div>
      </section>
    </main>
  );
}
