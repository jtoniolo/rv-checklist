'use client';

import { useAttachmentOutboxAuthBridge } from '@rv-checklist/web-data-access';
import type { JSX } from 'react';

/**
 * Mounts `useAttachmentOutboxAuthBridge` (ADR-0028, issue #152): a service
 * worker cannot reach the page's `sync-auth-status.ts` singleton directly (a
 * different realm), so the worker's own 401 on an outbox flush broadcasts
 * instead — this is what turns that broadcast into the same
 * `setSyncAuthStatus('signed-out')` a page-side connector 401 already drives,
 * so `SyncSignInBanner` (#149) is the one path both render through. Renders
 * nothing; `ServiceWorkerRegistrar` is the sibling this mirrors.
 */
export function AttachmentOutboxBridge(): JSX.Element {
  useAttachmentOutboxAuthBridge();
  return <></>;
}
