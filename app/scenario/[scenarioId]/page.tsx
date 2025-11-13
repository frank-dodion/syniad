export const dynamic = 'force-dynamic';

import { EditorClient } from '../EditorClient';

export default function ScenarioPage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  return <EditorClient params={params} />;
}

