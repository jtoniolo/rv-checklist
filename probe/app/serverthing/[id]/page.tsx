// Contrast case: the server reads params, but inside <Suspense> so the build passes.
import { Suspense } from 'react';

async function ServerBody({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <p data-testid="server-id">server id: {id}</p>;
}

export default async function ServerThing({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main>
      <h1>server thing</h1>
      <Suspense fallback={<p data-testid="server-fallback">SERVER SHELL FALLBACK</p>}>
        <ServerBody params={params} />
      </Suspense>
    </main>
  );
}
