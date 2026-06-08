import { Suspense } from "react";
import HomeClient from "@/components/HomeClient";

export default function Home() {
  return (
    <Suspense
      fallback={
        <p className="py-6 text-faint font-body">Loading</p>
      }
    >
      <HomeClient />
    </Suspense>
  );
}
