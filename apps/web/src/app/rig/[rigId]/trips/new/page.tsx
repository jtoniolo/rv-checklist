import type { JSX } from 'react';
import { NewTripScreen } from '../../../../new-trip-screen';

export default async function NewTripPage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  return <NewTripScreen rigId={rigId} />;
}
