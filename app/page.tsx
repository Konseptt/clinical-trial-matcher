import { Suspense } from "react";
import AnalysisIntro from "@/components/AnalysisIntro";
import MatchForm from "@/components/MatchForm";

export default function Home() {
  return (
    <>
      <AnalysisIntro />
      <Suspense fallback={<div className="info-card py-6 text-center text-faint">Loading search...</div>}>
        <MatchForm />
      </Suspense>
    </>
  );
}
