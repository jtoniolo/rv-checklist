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
  useDeleteAttachmentMutation,
  useSetCampgroundMapMutation,
  useUploadAttachmentMutation,
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
 * The attachments manager for one stop (issue #117, ADR-0026) — a collapsible
 * section, collapsed by default so a pile of paperwork never makes the page
 * busy. Shared by the next-stop hero and the trip editor's stop cards.
 * Capture comes from three sources: clipboard paste (the primary flow — e.g.
 * the Ontario Parks reservation page), a file picker, and the phone camera.
 * The paste listener is bound only while the section is open, so a paste
 * always lands on the one stop the owner has open (the editor mounts a
 * manager per stop).
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
        try {
          await upload({ stopId: stop.id, tripId, rigId, file }).unwrap();
        } catch {
          setError(`Couldn't upload “${file.name}”. Please try again.`);
          return;
        }
      }
    },
    [upload, stop.id, tripId, rigId],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onPaste = (event: ClipboardEvent): void => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (files.length === 0) return;
      event.preventDefault();
      void uploadFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('paste', onPaste);
    };
  }, [isOpen, uploadFiles]);

  const onInputChange = (input: HTMLInputElement): void => {
    const files = [...(input.files ?? [])];
    input.value = '';
    void uploadFiles(files);
  };

  const count = stop.attachments.length;
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
      <a
        href={attachmentUrl(attachment.id)}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-xs font-medium text-brand underline hover:no-underline dark:text-ink-inverted"
      >
        View
      </a>
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
 * `<img src>`) goes through cookie auth deliberately and surfaces failures;
 * on error the same-site link still works as a plain download (as it does
 * for HEIC, which most browsers won't render).
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
