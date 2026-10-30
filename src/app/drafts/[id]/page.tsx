import { Suspense } from "react";
import { AnalysisWorkspace } from "@/components/analysis/AnalysisWorkspace";

async function DraftAnalysis({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AnalysisWorkspace draftId={id} />;
}

export default function DraftAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <DraftAnalysis params={params} />
    </Suspense>
  );
}
