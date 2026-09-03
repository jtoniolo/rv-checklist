import './global.css';
import type { Metadata, Viewport } from 'next';
import type { JSX, ReactNode } from 'react';
import { AttachmentOutboxBridge } from './attachment-outbox-bridge';
import { StoreProvider } from './store-provider';
import { ServiceWorkerRegistrar } from './sw-register';
import { SyncSignInBanner } from './sync-banner';

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

/**
 * The two public values, serialised for the inline bootstrap script. One
 * published image serves every environment (ADR-0020), so the server reads the
 * values from its own environment on each request and hands them to the browser
 * here — no build-time inlining, no rebuild to point at a different API or
 * OAuth client. `<` is escaped so a value can never close the script tag.
 */
function publicConfigScript(): string {
  const runtime = {
    PUBLIC_API_BASE_URL: process.env.PUBLIC_API_BASE_URL ?? '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  };
  const json = JSON.stringify(runtime).replaceAll('<', String.raw`\u003c`);
  return `window.__PUBLIC_CONFIG__=${json}`;
}

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <html lang="en">
      <body>
        {/* Runs before the client bundle reads `config`, so the browser sees
            this request's values (ADR-0020). */}
        <script dangerouslySetInnerHTML={{ __html: publicConfigScript() }} />
        <StoreProvider>
          <SyncSignInBanner />
          {children}
        </StoreProvider>
        <ServiceWorkerRegistrar />
        <AttachmentOutboxBridge />
      </body>
    </html>
  );
}
