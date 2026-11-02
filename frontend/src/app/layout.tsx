import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/figtree/index.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '../../motion/nobpay-motion.css';
import './globals.css';
import { ServiceWorker } from '@/components/ServiceWorker';
import { SkipLink } from '@/components/ui/SkipLink';
import { I18nProvider } from '@/lib/i18n/client';
import { getLang, getT } from '@/lib/i18n/server';

/** In the visitor's language: pages that set no title of their own (and the link previews) use this one. */
export async function generateMetadata(): Promise<Metadata> {
  const [lang, t] = await Promise.all([getLang(), getT()]);
  const title = t('NobPay · Investissez au pays. Avec preuve.');
  return {
    title: { default: title, template: '%s · NobPay' },
    description: t("NobPay aide la diaspora à financer des projets, des frais de scolarité et des stocks de commerçants au pays : l'argent reste en séquestre et n'est libéré qu'étape par étape, sur preuve, avec une trace ancrée sur Bitcoin."),
    ...SHARED,
    openGraph: {
      title,
      description: t("L'argent de la diaspora, libéré étape par étape sur preuve et ancré sur Bitcoin."),
      locale: lang === 'en' ? 'en_US' : 'fr_FR',
      type: 'website',
    },
  };
}

const SHARED: Metadata = {
  applicationName: 'NobPay',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'NobPay', statusBarStyle: 'black-translucent' },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
};

// No maximum-scale / user-scalable: pinch-zoom must stay available (accessibility).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0037b0',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    // the landing page adds a class to <html> before hydration (see (site)/layout.tsx)
    <html lang={lang} suppressHydrationWarning>
      <body>
        <I18nProvider lang={lang}>
          <SkipLink />
          {children}
          <ServiceWorker />
        </I18nProvider>
      </body>
    </html>
  );
}
