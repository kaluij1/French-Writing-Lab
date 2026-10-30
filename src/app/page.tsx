import { Suspense } from "react";
import { WritingWorkspace } from "@/components/WritingWorkspace";

export default function WritePage() {
  return (
    <Suspense>
      <WritingWorkspace />
    </Suspense>
  );
}
