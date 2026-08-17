import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { McpTokenDialog } from './mcp-token-dialog';
import { StoreProvider } from './store-provider';

function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function noContentResponse(): Response {
  // eslint-disable-next-line unicorn/no-null
  return new Response(null, { status: 204 });
}

const state = {
  statusResponse: (): Response => jsonResponse({ active: false }),
  postCalls: [] as Request[],
};

function fakeApi(request: Request): Response {
  const url = new URL(request.url);
  const route = `${request.method} ${url.pathname}`;

  if (route === 'GET /mcp-token') return state.statusResponse();
  if (route === 'POST /mcp-token') {
    state.postCalls.push(request);
    return jsonResponse({ token: 'rvmcp_test-token-abc123' });
  }
  if (route === 'DELETE /mcp-token') return noContentResponse();

  throw new Error(`Unstubbed request: ${route}${url.search}`);
}

const onOpenChange = jest.fn();

function renderDialog(): void {
  onOpenChange.mockClear();
  render(
    <StoreProvider>
      <McpTokenDialog isOpen onOpenChange={onOpenChange} />
    </StoreProvider>,
  );
}

describe('McpTokenDialog (issue #77)', () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    state.postCalls = [];
    state.statusResponse = () => jsonResponse({ active: false });
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) =>
        Promise.resolve(fakeApi(input as Request)),
      );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('shows the generate button when no token is active', async () => {
    renderDialog();

    const btn = await screen.findByRole('button', { name: 'Generate' });
    expect(btn).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('shows the raw token after generating', async () => {
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('rvmcp_test-token-abc123')).toBeTruthy();
    expect(state.postCalls).toHaveLength(1);
  });

  it('shows regenerate and revoke when a token is active', async () => {
    state.statusResponse = () =>
      jsonResponse({
        active: true,
        createdAt: '2026-08-15T00:00:00.000Z',
        lastUsedAt: '2026-08-16T12:00:00.000Z',
      });

    renderDialog();

    expect(
      await screen.findByRole('button', { name: 'Regenerate' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Generate' })).toBeNull();
  });

  it('shows status info for an active token', async () => {
    state.statusResponse = () =>
      jsonResponse({
        active: true,
        createdAt: '2026-08-15T00:00:00.000Z',
      });

    renderDialog();

    expect(await screen.findByText(/Active/)).toBeTruthy();
    expect(screen.getByText(/Never/)).toBeTruthy();
  });

  it('shows a confirmation step before regenerating', async () => {
    state.statusResponse = () =>
      jsonResponse({
        active: true,
        createdAt: '2026-08-15T00:00:00.000Z',
      });

    renderDialog();

    const regenBtn = await screen.findByRole('button', { name: 'Regenerate' });
    fireEvent.click(regenBtn);

    const warning = await screen.findByText(
      /existing token will stop working/i,
    );
    expect(warning).toBeTruthy();
  });

  it('revokes the token and shows no active token', async () => {
    let isRevoked = false;
    state.statusResponse = () => {
      if (isRevoked) return jsonResponse({ active: false });
      return jsonResponse({
        active: true,
        createdAt: '2026-08-15T00:00:00.000Z',
      });
    };

    renderDialog();

    const revokeBtn = await screen.findByRole('button', { name: 'Revoke' });
    isRevoked = true;
    fireEvent.click(revokeBtn);

    await waitFor(() => {
      expect(screen.getByText(/no active token/i)).toBeTruthy();
    });
  });

  it('has a copy button when the raw token is displayed', async () => {
    renderDialog();

    fireEvent.click(await screen.findByRole('button', { name: 'Generate' }));

    expect(
      await screen.findByRole('button', { name: 'Copy token' }),
    ).toBeTruthy();
  });
});
