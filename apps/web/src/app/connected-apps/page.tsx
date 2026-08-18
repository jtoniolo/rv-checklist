import type { JSX } from 'react';
import { ConnectedAppsScreen } from '../connected-apps-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchMe } from '@/lib/server-api';

export default async function ConnectedAppsPage(): Promise<JSX.Element> {
  const me = await fetchMe();

  return (
    <CacheSeeder me={me}>
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 lg:px-6">
        <ConnectedAppsScreen />
      </div>
    </CacheSeeder>
  );
}
