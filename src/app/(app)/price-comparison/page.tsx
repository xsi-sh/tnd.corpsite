export const metadata = {
  title: "Price Comparison | Tactical Narcotics Division",
  description: "Upload item names to compare Jita vs Amarr buy/sell prices and hauling spreads.",
};

import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";
import { PriceComparisonClient } from "./PriceComparisonClient";

export default function PriceComparisonPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <PriceComparisonClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
