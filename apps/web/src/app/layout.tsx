import './global.css';
import type { Metadata, Viewport } from 'next';
import type { JSX, ReactNode } from 'react';
import { StoreProvider } from './store-provider';
import { ServiceWorkerRegistrar } from './sw-register';

export const metadata: Metadata = {
  applicationName: 'RV Checklist',
  title: {
    default: 'RV Checklist & Maintenance Tracker',
    template: '%s · RV Checklist',
  },
  description:
    'Checklists and maintenance tracking for your rig — nothing left behind, and always an answer to "when did I last do this?"',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RV Checklist',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#1f3a5f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>
        <StoreProvider>{children}</StoreProvider>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
