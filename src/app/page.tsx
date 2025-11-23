import { HeroCard } from "@/components/magic/HeroCard";
import { cacheLife } from "next/cache";

export default async function Home() {
  "use cache";
  cacheLife("max");

  return (
    <main className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto w-full max-w-6xl">
        <HeroCard />
      </div>
    </main>
  );
}
