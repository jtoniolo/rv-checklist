import type { JSX } from 'react';
import styles from './page.module.css';

/**
 * The empty walking shell (issue #11). A mobile-first landing surface with no
 * data, no auth, and no features yet — just enough chrome to prove the app
 * renders and installs. Real screens land in later slices.
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
      <section className={styles['placeholder']} aria-label="Coming soon">
        <p>Nothing here yet — the app is being built slice by slice.</p>
      </section>
    </main>
  );
}
