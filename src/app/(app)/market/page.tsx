export const metadata = {
  title: "Market Analysis | Tactical Narcotics Division",
  description: "Analyze EVE markets and assets with rich price, depth, and history tools.",
};

import { MarketClient } from "./MarketClient";
import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";

export default function MarketPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl items-center px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <MarketClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
