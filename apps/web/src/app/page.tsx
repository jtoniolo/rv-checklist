import type { JSX } from 'react';
import { AuthPanel } from './auth-panel';
import styles from './page.module.css';

/**
 * The mobile-first landing surface. The shell arrived in #11; this slice (#13)
 * adds sign-in — the owner authenticates with Google and sees their own
 * identity fetched from the API. Real feature screens land in later slices.
 */
export default function Index(): JSX.Element {
  return (
    <main className={styles['shell']}>
      <header className={styles['header']}>
        <h1 className={styles['title']}>RV Checklist</h1>
        <p className={styles['tagline']}>
          Maintenance &amp; packing, one rig at a time.
        </p>
      </header>
      <AuthPanel />
    </main>
  );
}
