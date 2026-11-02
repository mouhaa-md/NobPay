import type { Metadata } from 'next';
import { Icon } from '@/components/ui/Icon';
import { LookupForm } from '@/components/verify/LookupForm';
import { VerifyFile } from '@/components/verify/VerifyFile';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('Vérifier un dossier'),
    description: t("Contrôlez, sans compte et sans faire confiance à NobPay, qu'un dossier de projet n'a pas été modifié et qu'il est ancré sur Bitcoin."),
  };
}

export default function VerifyHome() {
  return (
    <div className="flex flex-col gap-space-lg">
      <section>
        <span className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFEDD5] text-[#C26700]">
          <Icon name="fact_check" size={26} />
        </span>
        <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight md:text-[34px] md:leading-[40px]"><Tc>Vérifier un dossier, sans nous croire</Tc></h1>
        <p className="mt-2 font-body-lg text-body-lg text-on-surface-variant">
          <Tc>Chaque projet NobPay garde un registre où chaque ligne contient l&apos;empreinte de la précédente. Son empreinte finale est inscrite dans la blockchain Bitcoin. Ici, c&apos;est votre navigateur qui refait les calculs.</Tc>
        </p>
      </section>

      <section className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm ring-1 ring-outline-variant/30">
        <h2 className="mb-3 font-title-lg text-title-lg"><Tc>Vous avez un lien de vérification</Tc></h2>
        <LookupForm />
      </section>

      <section className="rounded-3xl bg-surface-container-lowest p-5 shadow-sm ring-1 ring-outline-variant/30">
        <h2 className="mb-1 font-title-lg text-title-lg"><Tc>Vous avez le fichier du dossier</Tc></h2>
        <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant"><Tc>Le contrôle se fait entièrement sur votre appareil.</Tc></p>
        <VerifyFile />
      </section>

      <section className="rounded-3xl bg-surface-container-low p-5">
        <h2 className="mb-2 font-title-md text-title-md"><Tc>Ce que cela prouve, et ce que cela ne prouve pas</Tc></h2>
        <ul className="space-y-2 font-body-sm text-body-sm text-on-surface-variant">
          <li className="flex gap-2">
            <Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-[#16A34A]" /> <Tc>Le dossier n&apos;a pas été modifié depuis son ancrage : date, montants et ordre des événements sont figés.</Tc>
          </li>
          <li className="flex gap-2">
            <Icon name="check_circle" size={18} className="mt-0.5 shrink-0 text-[#16A34A]" /> <Tc>L&apos;ancrage est publié sur Bitcoin avec un standard ouvert (OpenTimestamps), contrôlable sans NobPay.</Tc>
          </li>
          <li className="flex gap-2">
            <Icon name="info" size={18} className="mt-0.5 shrink-0 text-primary" /> <Tc>Cela ne prouve pas qu&apos;une photo montre le bon chantier : c&apos;est le financeur qui l&apos;apprécie avant de payer. Les photos sont, elles, empreintées au moment de l&apos;envoi.</Tc>
          </li>
        </ul>
      </section>
    </div>
  );
}
