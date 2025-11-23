export const metadata = {
  title: "Safe to Warp | Tactical Narcotics Division",
  description:
    "A Tactical Narcotics Division reference for evaluating warp safety and risks.",
};

import { SafeToWarpClient } from "./SafeToWarpClient";
import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";

export default function SafeToWarpPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl items-center px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <SafeToWarpClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
