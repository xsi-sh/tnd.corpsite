export const metadata = {
  title: "Local Check | Tactical Narcotics Division",
  description:
    "Paste local and quickly understand who is a threat in your system.",
};

import { LocalCheckClient } from "./LocalCheckClient";
import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";

export default function LocalCheckPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <LocalCheckClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
