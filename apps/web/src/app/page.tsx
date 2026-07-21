import type { JSX } from 'react';
import { AppRoot } from './app-root';

/**
 * The single route. Everything is client-rendered from here (issue #22): the
 * theme surface, then the signed-in app shell or the signed-out welcome —
 * navigation inside the shell is client state, not URL routes.
 */
export default function Index(): JSX.Element {
  return <AppRoot />;
}
