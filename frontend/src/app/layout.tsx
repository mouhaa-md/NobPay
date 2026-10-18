import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque/standard.css';
import '@fontsource-variable/figtree/index.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import '@fontsource-variable/material-symbols-outlined/fill.css';
import '../../motion/nobpay-motion.css';
import './globals.css';
import { ServiceWorker } from '@/components/ServiceWorker';

export const metadata: Metadata = {
  title: { default: 'NobPay · Investissez au pays. Avec preuve.', template: '%s · NobPay' },
  description:
    "NobPay aide la diaspora à financer des projets immobiliers, agricoles et commerciaux au pays : l'argent reste en séquestre et n'est libéré qu'étape par étape, sur preuve, avec une trace ancrée sur Bitcoin.",
  applicationName: 'NobPay',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'NobPay', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
  openGraph: {
    title: 'NobPay · Investissez au pays. Avec preuve.',
    description: "L'argent de la diaspora, libéré étape par étape sur preuve et ancré sur Bitcoin.",
    locale: 'fr_FR',
    type: 'website',
  },
};

// No maximum-scale / user-scalable: pinch-zoom must stay available (accessibility).
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0037b0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // the landing page adds a class to <html> before hydration (see (site)/layout.tsx)
    <html lang="fr" suppressHydrationWarning>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
