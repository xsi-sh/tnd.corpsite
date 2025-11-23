import { SystemLookupClient } from "./SystemLookupClient";
import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";

export const metadata = {
  title: "System Lookup | Tactical Narcotics Division",
  description: "Search EVE systems for security, region, and recent activity.",
};

export default function SystemLookupPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground>
          <SystemLookupClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
