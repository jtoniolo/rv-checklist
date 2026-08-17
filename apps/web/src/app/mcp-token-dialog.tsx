'use client';

import {
  useGenerateMcpTokenMutation,
  useMcpTokenStatusQuery,
  useRevokeMcpTokenMutation,
} from '@rv-checklist/web-data-access';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@rv-checklist/web-ui';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useCallback, useState, type JSX } from 'react';

function formatDate(iso: string | undefined): string {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function McpTokenDialog({
  isOpen,
  onOpenChange,
}: {
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
}): JSX.Element {
  const { data: status, isLoading } = useMcpTokenStatusQuery(undefined, {
    skip: !isOpen,
  });
  const [generate] = useGenerateMcpTokenMutation();
  const [revoke] = useRevokeMcpTokenMutation();

  const [rawToken, setRawToken] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  const handleOpenChange = useCallback(
    (isNext: boolean) => {
      if (!isNext) {
        setRawToken(undefined);
        setCopied(false);
        setConfirmRegenerate(false);
      }
      onOpenChange(isNext);
    },
    [onOpenChange],
  );

  const handleGenerate = async (): Promise<void> => {
    const result = await generate().unwrap();
    setRawToken(result.token);
    setCopied(false);
    setConfirmRegenerate(false);
  };

  const handleCopy = async (): Promise<void> => {
    if (!rawToken) return;
    try {
      await navigator.clipboard.writeText(rawToken);
      setCopied(true);
    } catch {
      // Clipboard API may be unavailable; the token is still visible.
    }
  };

  const handleRevoke = async (): Promise<void> => {
    await revoke().unwrap();
    setRawToken(undefined);
    setCopied(false);
    setConfirmRegenerate(false);
  };

  const hasActiveToken = status?.active === true;

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>MCP Token</DialogTitle>
          <DialogDescription>
            Use this token to connect Claude and other MCP clients.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-4">
            {rawToken ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Copy this token now — it cannot be shown again.
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm break-all">
                    {rawToken}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => void handleCopy()}
                    aria-label="Copy token"
                  >
                    {copied ? (
                      <CheckIcon className="size-4" />
                    ) : (
                      <CopyIcon className="size-4" />
                    )}
                  </Button>
                </div>
              </div>
            ) : hasActiveToken ? (
              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-medium">Status:</span> Active
                </p>
                <p>
                  <span className="font-medium">Created:</span>{' '}
                  {formatDate(status.createdAt)}
                </p>
                <p>
                  <span className="font-medium">Last used:</span>{' '}
                  {formatDate(status.lastUsedAt)}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active token. Generate one to connect MCP clients.
              </p>
            )}

            {confirmRegenerate ? (
              <div className="space-y-2 rounded-md border border-destructive/50 p-3">
                <p className="text-sm">
                  The existing token will stop working immediately. Continue?
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void handleGenerate()}
                  >
                    Regenerate
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setConfirmRegenerate(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : undefined}
          </div>
        )}

        {!isLoading && !rawToken ? (
          <DialogFooter>
            {hasActiveToken ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirmRegenerate(true);
                  }}
                >
                  Regenerate
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleRevoke()}
                >
                  Revoke
                </Button>
              </>
            ) : (
              <Button onClick={() => void handleGenerate()}>Generate</Button>
            )}
          </DialogFooter>
        ) : undefined}
      </DialogContent>
    </Dialog>
  );
}
