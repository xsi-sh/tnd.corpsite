import type { Metadata } from "next";

import { EveFitMain } from "@/components/evefit/EveFitMain";
import { EveFitProviders } from "@/components/evefit/EveFitProviders";
import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";

export const metadata: Metadata = {
  title: "Ship Fitting | Tactical Narcotics Division",
  description: "EVEShipFit-powered fitting inside the Tactical Narcotics Division console.",
};

export default function FitPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <EveFitProviders>
            <EveFitMain />
          </EveFitProviders>
        </SystemLookupBackground>
      </div>
    </main>
  );
}
