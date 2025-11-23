import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";
import { PlayerLookupClient } from "./PlayerLookupClient";

export const metadata = {
  title: "Player Lookup | Tactical Narcotics Division",
  description:
    "Search EVE characters with rich intel cards powered by ESI and zKillboard.",
};

export default function PlayerLookupPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground>
          <PlayerLookupClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
