export const metadata = {
  title: "Corporation Lookup | Tactical Narcotics Division",
  description: "Search EVE corporations and view quick intel with zKill snapshots.",
};

import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";
import { CorpLookupClient } from "./CorpLookupClient";

export default function CorpLookupPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground>
          <CorpLookupClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
