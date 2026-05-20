import { Suspense } from "react";
import { DashboardView } from "@/features/dashboard/DashboardView";

export default function HomePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DashboardView />
    </Suspense>
  );
}
