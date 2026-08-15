import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import RootPage from './page';

jest.mock('next/headers');
jest.mock('next/navigation');

const mockCookies = cookies as jest.MockedFunction<typeof cookies>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

function stubLastRigCookie(value?: string): void {
  mockCookies.mockResolvedValue({
    get: (name: string) =>
      name === 'rv.last-rig' && value !== undefined
        ? { name, value }
        : undefined,
  } as Awaited<ReturnType<typeof cookies>>);
}

describe('root redirect', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('redirects to the last-used rig when the hint cookie is set', async () => {
    stubLastRigCookie('abc-123');
    await RootPage();
    expect(mockRedirect).toHaveBeenCalledWith('/rig/abc-123');
  });

  it('redirects to the rig manager when no hint cookie exists', async () => {
    stubLastRigCookie();
    await RootPage();
    expect(mockRedirect).toHaveBeenCalledWith('/rigs');
  });
});
