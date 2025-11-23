import { RoutePlannerClient } from "./RoutePlannerClient";
import { RoutePlannerBackground } from "@/components/magic/RoutePlannerBackground";

export const metadata = {
  title: "Route Planner | Tactical Narcotics Division",
  description: "Plan routes through New Eden with security and kill intel.",
};

export default function RoutePlannerPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl items-stretch px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <RoutePlannerBackground>
          <RoutePlannerClient />
        </RoutePlannerBackground>
      </div>
    </main>
  );
}
