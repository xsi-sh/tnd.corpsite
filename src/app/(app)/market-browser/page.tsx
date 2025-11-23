export const metadata = {
  title: "Market Browser | Tactical Narcotics Division",
  description:
    "Classic market browser panel for Tactical Narcotics Division capsuleers.",
};

import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";
import { MarketBrowserClient } from "./MarketBrowserClient";

export default function MarketBrowserPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <MarketBrowserClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
