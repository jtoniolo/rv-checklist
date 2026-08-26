'use client';

import {
  attachmentMimeTypes,
  maxAttachmentSizeBytes,
  type Attachment,
  type Id,
  type StopRead,
} from '@rv-checklist/domain';
import {
  attachmentUrl,
  discardOutboxAttachment,
  enqueueAttachmentCapture,
  evictAttachmentCache,
  retryOutboxAttachment,
  useDeleteAttachmentMutation,
  useIsAttachmentCached,
  useIsOffline,
  useOutboxEntriesForStop,
  useSetCampgroundMapMutation,
  useUploadAttachmentMutation,
  type OutboxEntry,
} from '@rv-checklist/web-data-access';
import { Button, Collapsible } from '@rv-checklist/web-ui';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type ReactNode,
} from 'react';

/**
 * Why a file is refused before any request leaves the browser (the server
 * re-validates — this is the friendly first line, issue #117).
 */
function rejectionReason(file: File): string | undefined {
  if (!(attachmentMimeTypes as readonly string[]).includes(file.type)) {
    return `“${file.name}” isn't a supported type — use a JPEG, PNG, WebP, or HEIC image, or a PDF.`;
  }
  if (file.size > maxAttachmentSizeBytes) {
    return `“${file.name}” is too big — the limit is ${formatSize(maxAttachmentSizeBytes)} per file.`;
  }
  return undefined;
}

/** Human-readable file size, e.g. "412 KB", "2.4 MB", or "15 MB". */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${Number.isSafeInteger(mb) ? String(mb) : mb.toFixed(1)} MB`;
}

/**
 * Open an attachment in a new tab (issue #151). A `fetch` from the page, not
 * a plain `<a target="_blank">`: a cross-origin top-level navigation is
 * never routed through this origin's service worker (only a document's own
 * subresource fetches are), so it is the one way the current-trip warming
 * and browsed-attachment caches (ADR-0028) ever actually get to answer a
 * "View" click instead of the network. The target tab opens synchronously,
 * before the `await`, so the browser's popup blocker sees it as the direct
 * result of the click.
 */
async function openAttachment(
  id: Id,
  onError: (message: string) => void,
): Promise<void> {
  const target = window.open('', '_blank');
  try {
    const response = await fetch(attachmentUrl(id), {
      credentials: 'include',
    });
    if (!response.ok) {
      throw new Error(`Download failed (${String(response.status)})`);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (target) {
      target.location.href = url;
    } else {
      window.open(url, '_blank');
    }
  } catch {
    target?.close();
    onError("Couldn't open the file. Please try again.");
  }
}

/**
 * The paste-target stack, shared by every mounted manager: each section
 * pushes a token while open, and only the top of the stack — the most
 * recently opened section — consumes a document paste. The editor mounts a
 * manager per stop with independent disclosures, so without this guard one
 * Ctrl+V would upload to every open stop at once.
 */
const pasteTargets: symbol[] = [];

/**
 * The attachments manager for one stop (issue #117, ADR-0026) — a collapsible
 * section, collapsed by default so a pile of paperwork never makes the page
 * busy. Shared by the next-stop hero and the trip editor's stop cards.
 * Capture comes from three sources: clipboard paste (the primary flow — e.g.
 * the Ontario Parks reservation page), a file picker, and the phone camera.
 * The paste listener is bound only while the section is open, and the
 * paste-target stack ensures a paste lands on exactly one stop — the section
 * the owner opened last.
 */
export function StopAttachments({
  stop,
  tripId,
  rigId,
}: {
  readonly stop: StopRead;
  readonly tripId: Id;
  readonly rigId: Id;
}): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [upload, { isLoading: isUploading }] = useUploadAttachmentMutation();
  const isOffline = useIsOffline();
  const outboxEntries = useOutboxEntriesForStop(stop.id);
  const pickerRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const uploadFiles = useCallback(
    async (files: readonly File[]): Promise<void> => {
      for (const file of files) {
        const reason = rejectionReason(file);
        if (reason !== undefined) {
          setError(reason);
          return;
        }
      }
      setError(undefined);
      for (const file of files) {
        // Offline captures never touch `uploadAttachment` (ADR-0028): they
        // queue in the IndexedDB outbox and wait for Background Sync (or the
        // app reopening) to replay them — there is no server row yet to fail
        // an immediate mutation against.
        if (isOffline) {
          const queued = await enqueueAttachmentCapture({
            stopId: stop.id,
            tripId,
            rigId,
            file,
          });
          if (queued === undefined) {
            setError(
              `Couldn't queue “${file.name}” for upload. Please try again.`,
            );
            return;
          }
          continue;
        }
        try {
          await upload({ stopId: stop.id, tripId, rigId, file }).unwrap();
        } catch {
          setError(`Couldn't upload “${file.name}”. Please try again.`);
          return;
        }
      }
    },
    [upload, stop.id, tripId, rigId, isOffline],
  );

  useEffect(() => {
    if (!isOpen) return;
    const token = Symbol('paste target');
    pasteTargets.push(token);
    const onPaste = (event: ClipboardEvent): void => {
      if (pasteTargets.at(-1) !== token) return;
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      void uploadFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
      const index = pasteTargets.indexOf(token);
      if (index !== -1) pasteTargets.splice(index, 1);
    };
  }, [isOpen, uploadFiles]);

  const onInputChange = (input: HTMLInputElement): void => {
    const files = [...(input.files ?? [])];
    input.value = '';
    void uploadFiles(files);
  };

  const count = stop.attachments.length + outboxEntries.length;
  return (
    <div className="border-t border-hairline pt-3">
      <Collapsible
        summary={`Attachments${count === 0 ? '' : ` (${String(count)})`}`}
        onOpenChange={setIsOpen}
      >
        {/* The body renders only while open — the paste listener, the inputs,
            and the rows all come and go with the disclosure. */}
        {isOpen ? (
          <div className="flex flex-col gap-3">
            {count === 0 ? (
              <p className="text-sm text-brand-muted">
                No attachments yet — keep the campground map and other arrival
                paperwork here.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
                {stop.attachments.map((attachment) => (
                  <AttachmentRow
                    key={attachment.id}
                    attachment={attachment}
                    tripId={tripId}
                    rigId={rigId}
                    onError={setError}
                  />
                ))}
                {outboxEntries.map((entry) => (
                  <OutboxAttachmentRow
                    key={entry.id}
                    entry={entry}
                    stopId={stop.id}
                  />
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isUploading}
                onClick={() => pickerRef.current?.click()}
              >
                Choose file
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isUploading}
                onClick={() => cameraRef.current?.click()}
              >
                Take photo
              </Button>
              <span className="text-xs text-brand-muted">
                {isUploading ? 'Uploading…' : '…or paste an image (Ctrl+V)'}
              </span>
            </div>
            <input
              ref={pickerRef}
              type="file"
              accept={attachmentMimeTypes.join(',')}
              className="hidden"
              aria-label="Attachment file"
              onChange={(event) => {
                onInputChange(event.currentTarget);
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              aria-label="Camera capture"
              onChange={(event) => {
                onInputChange(event.currentTarget);
              }}
            />

            {error === undefined ? undefined : (
              <p
                className="text-sm text-red-600 dark:text-red-400"
                role="alert"
              >
                {error}
              </p>
            )}
          </div>
        ) : undefined}
      </Collapsible>
    </div>
  );
}

/** One attachment: name, size, view (the API proxy streams inline), map flag, delete. */
function AttachmentRow({
  attachment,
  tripId,
  rigId,
  onError,
}: {
  readonly attachment: Attachment;
  readonly tripId: Id;
  readonly rigId: Id;
  readonly onError: (message: string) => void;
}): JSX.Element {
  const [setCampgroundMap, { isLoading: isFlagging }] =
    useSetCampgroundMapMutation();
  const [deleteAttachment, { isLoading: isDeleting }] =
    useDeleteAttachmentMutation();
  const isOffline = useIsOffline();
  // Only worth asking Cache Storage while offline — online, "View" always
  // works regardless (the fetch falls back to the network).
  const isCached = useIsAttachmentCached(attachment.id, isOffline);
  const isViewDisabled = isOffline && isCached === false;

  const toggleFlag = async (): Promise<void> => {
    try {
      await setCampgroundMap({
        id: attachment.id,
        tripId,
        rigId,
        isCampgroundMap: !attachment.isCampgroundMap,
      }).unwrap();
    } catch {
      onError(`Couldn't update the campground-map flag. Please try again.`);
    }
  };

  const remove = async (): Promise<void> => {
    try {
      await deleteAttachment({ id: attachment.id, tripId, rigId }).unwrap();
      // Bytes are gone server-side; drop them from wherever they are cached
      // too (ADR-0028's fourth acceptance criterion, issue #151).
      evictAttachmentCache(attachment.id);
    } catch {
      onError(`Couldn't delete “${attachment.filename}”. Please try again.`);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">
        {attachment.filename}
      </span>
      <span className="shrink-0 text-xs text-brand-muted">
        {formatSize(attachment.sizeBytes)}
      </span>
      {isViewDisabled ? (
        <span
          className="shrink-0 text-xs text-brand-muted"
          title="This file has not been saved for offline use."
        >
          View (available online)
        </span>
      ) : (
        <button
          type="button"
          onClick={() => void openAttachment(attachment.id, onError)}
          className="shrink-0 text-xs font-medium text-brand underline hover:no-underline dark:text-ink-inverted"
        >
          View
        </button>
      )}
      <button
        type="button"
        aria-pressed={attachment.isCampgroundMap}
        aria-label={`Campground map flag — ${attachment.filename}`}
        disabled={isFlagging}
        onClick={() => void toggleFlag()}
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
          attachment.isCampgroundMap
            ? 'border-brand bg-brand text-white'
            : 'border-hairline text-brand-muted hover:border-brand'
        }`}
      >
        Campground map
      </button>
      <button
        type="button"
        disabled={isDeleting}
        onClick={() => void remove()}
        className="shrink-0 text-xs text-brand-muted underline hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
        aria-label={`Delete ${attachment.filename}`}
      >
        Delete
      </button>
    </li>
  );
}

/**
 * One queued offline capture (ADR-0028, issue #152) — outbox-only, so
 * there is no server row to view, flag, or delete: just the badge for its
 * status and the two actions the outbox itself owns. Retrying re-registers
 * Background Sync; discarding is a plain IndexedDB delete, never a server
 * call, since a pending or failed capture never had a server row to begin
 * with.
 */
function OutboxAttachmentRow({
  entry,
  stopId,
}: {
  readonly entry: OutboxEntry;
  readonly stopId: Id;
}): JSX.Element {
  const isFailed = entry.status === 'failed';
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">
        {entry.filename}
      </span>
      <span className="shrink-0 text-xs text-brand-muted">
        {formatSize(entry.blob.size)}
      </span>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
          isFailed
            ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
            : 'border-hairline text-brand-muted'
        }`}
      >
        {isFailed
          ? (entry.errorMessage ?? 'Upload failed')
          : 'Waiting to upload'}
      </span>
      {isFailed ? (
        <button
          type="button"
          onClick={() => void retryOutboxAttachment(stopId, entry.id)}
          className="shrink-0 text-xs font-medium text-brand underline hover:no-underline dark:text-ink-inverted"
          aria-label={`Retry ${entry.filename}`}
        >
          Retry
        </button>
      ) : undefined}
      <button
        type="button"
        onClick={() => void discardOutboxAttachment(stopId, entry.id)}
        className="shrink-0 text-xs text-brand-muted underline hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
        aria-label={`Discard ${entry.filename}`}
      >
        Discard
      </button>
    </li>
  );
}

/**
 * The hero's first-class campground-map control (issue #117): a toggle next
 * to "Navigate to this stop" that opens the flagged attachment inline —
 * wayfinding *within* the grounds after arrival, never the navigation link
 * that drives *to* the stop (CONTEXT.md).
 */
export function CampgroundMapLink({
  attachment,
}: {
  readonly attachment: Attachment;
}): JSX.Element {
  const [showing, setShowing] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-expanded={showing}
        onClick={() => {
          setShowing((s) => !s);
        }}
        className="self-start rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-brand hover:border-brand dark:text-ink-inverted"
      >
        {showing ? 'Hide campground map' : 'Campground map'}
      </button>
      {showing ? <CampgroundMapViewer attachment={attachment} /> : undefined}
    </>
  );
}

/**
 * The inline viewer: fetches the bytes with credentials and renders a blob
 * URL — an expanded image or an embedded PDF. A fetch (unlike a bare
 * `<img src>`) goes through cookie auth deliberately and surfaces failures.
 * A download that succeeds can still fail to render (HEIC in most browsers),
 * so the image's own error also flips to the fallback — a same-site link
 * that works as a plain download.
 */
function CampgroundMapViewer({
  attachment,
}: {
  readonly attachment: Attachment;
}): JSX.Element {
  const [url, setUrl] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let isCancelled = false;
    let objectUrl: string | undefined;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(attachmentUrl(attachment.id), {
          credentials: 'include',
        });
        if (!response.ok) {
          throw new Error(`Download failed (${String(response.status)})`);
        }
        const blob = await response.blob();
        if (isCancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch {
        if (!isCancelled) setFailed(true);
      }
    };
    void load();
    return () => {
      isCancelled = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  let content: ReactNode;
  if (failed) {
    content = (
      <p className="text-sm text-red-600 dark:text-red-400" role="alert">
        Couldn&apos;t load the map —{' '}
        <a
          href={attachmentUrl(attachment.id)}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          open it directly
        </a>
        .
      </p>
    );
  } else if (url === undefined) {
    content = <p className="text-sm text-brand-muted">Loading the map…</p>;
  } else if (attachment.mimeType === 'application/pdf') {
    content = (
      <iframe
        src={url}
        title={attachment.filename}
        className="h-96 w-full rounded-md border border-hairline"
      />
    );
  } else {
    content = (
      // A blob URL can't go through next/image's optimizer — the plain tag is
      // deliberate here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={attachment.filename}
        onError={() => {
          setFailed(true);
        }}
        className="w-full rounded-md border border-hairline"
      />
    );
  }
  // `w-full` pushes the viewer onto its own row inside the hero's wrapping
  // action row.
  return (
    <div aria-label="Campground map" className="w-full">
      {content}
    </div>
  );
}
