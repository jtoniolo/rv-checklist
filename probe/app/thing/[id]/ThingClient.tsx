'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function ThingClient() {
  const params = useParams<{ id: string }>();
  const [loc, setLoc] = useState('(ssr)');
  useEffect(() => {
    setLoc(window.location.pathname);
  }, []);
  return (
    <section>
      <p data-testid="useparams-id">useParams id: {String(params?.id)}</p>
      <p data-testid="location-path">window.location.pathname: {loc}</p>
    </section>
  );
}
