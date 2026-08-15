import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

const LAST_RIG_COOKIE = 'rv.last-rig';

/**
 * Bare root redirect (ADR-0018). Reads a non-httpOnly hint cookie set by the
 * rig switcher and lands the owner on their last-used rig without any visible
 * intermediate UI. Falls back to the rig manager when no hint exists. The
 * cookie is never used for auth — only this redirect.
 */
export default async function RootPage() {
  const cookieStore = await cookies();
  const lastRig = cookieStore.get(LAST_RIG_COOKIE)?.value;
  redirect(lastRig ? `/rig/${lastRig}` : '/rigs');
}
