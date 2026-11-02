import type { Metadata } from 'next';
import { Landing } from '@/components/site/Landing';
import { LANDING_COPY } from '@/components/site/landingCopy';

export const metadata: Metadata = {
  title: { absolute: LANDING_COPY.en.meta.title },
  description: LANDING_COPY.en.meta.description,
  alternates: { canonical: '/en', languages: { fr: '/', en: '/en' } },
  openGraph: { locale: 'en', title: LANDING_COPY.en.meta.title, description: LANDING_COPY.en.meta.description },
};

export default function LandingEn() {
  return <Landing lang="en" />;
}
