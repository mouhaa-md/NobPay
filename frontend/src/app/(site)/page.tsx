import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Landing } from '@/components/site/Landing';
import { LANDING_COPY } from '@/components/site/landingCopy';
import { getLang } from '@/lib/i18n/server';

export const metadata: Metadata = {
  title: { absolute: LANDING_COPY.fr.meta.title },
  description: LANDING_COPY.fr.meta.description,
  alternates: { canonical: '/', languages: { fr: '/', en: '/en' } },
};

export default async function LandingFr() {
  // a visitor whose browser asks for English (and who has not chosen a language) lands on the English page
  if ((await getLang()) === 'en') redirect('/en');
  return <Landing lang="fr" />;
}
