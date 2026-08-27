import { Suspense } from 'react';
import ThingClient from './ThingClient';

export default function ThingPage() {
  // No params read on the server. Everything about the id is decided on the client,
  // so the App Shell can be prerendered for the whole route pattern.
  return (
    <main>
      <h1>thing route</h1>
      <Suspense fallback={<p data-testid="fallback">SHELL FALLBACK</p>}>
        <ThingClient />
      </Suspense>
    </main>
  );
}
