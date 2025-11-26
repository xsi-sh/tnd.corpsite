import { AssetsClient } from "./AssetsClient";
import { SystemLookupBackground } from "@/components/magic/SystemLookupBackground";

export const metadata = {
  title: "Asset Analysis | Tactical Narcotics Division",
  description: "Comprehensive valuation and tracking of personal assets.",
};

export default function AssetsPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full">
        <SystemLookupBackground enableScan={false}>
          <AssetsClient />
        </SystemLookupBackground>
      </div>
    </main>
  );
}
