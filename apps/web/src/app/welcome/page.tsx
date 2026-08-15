import { Suspense, type JSX } from 'react';
import { WelcomeContent } from './welcome-content';

export default function WelcomePage(): JSX.Element {
  return (
    <Suspense>
      <WelcomeContent />
    </Suspense>
  );
}
