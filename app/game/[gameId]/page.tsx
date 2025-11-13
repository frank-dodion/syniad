export const dynamic = 'force-dynamic';

import { GameClient } from '../GameClient';

export default function GamePage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  return <GameClient params={params} />;
}

