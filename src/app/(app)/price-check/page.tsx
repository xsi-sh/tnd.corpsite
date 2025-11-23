export const metadata = {
  title: "Price Check | Tactical Narcotics Division",
  description: "Drop a list of items to quickly price-check best buy/sell across major hubs.",
};

import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";
import { PriceCheckClient } from "./PriceCheckClient";

export default function PriceCheckPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <PriceCheckClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
