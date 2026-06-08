import { Suspense } from "react";
import AnalysisIntro from "@/components/AnalysisIntro";
import MatchForm from "@/components/MatchForm";

export default function Home() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 xl:gap-12 items-start">
      <div className="lg:col-span-5 xl:col-span-4">
        <AnalysisIntro />
      </div>
      <div className="lg:col-span-7 xl:col-span-8">
        <Suspense
          fallback={
            <div className="info-card py-6 text-center text-faint">
              Loading search…
            </div>
          }
        >
          <MatchForm />
        </Suspense>
      </div>
    </div>
  );
}
