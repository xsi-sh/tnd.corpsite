export default function AppLoading() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-3.5rem-3.5rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
      <div className="w-full space-y-6">
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-zinc-800/80" />
          <div className="h-3 w-64 rounded bg-zinc-900/80" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-zinc-800/70 bg-zinc-950/80 p-4">
            <div className="h-4 w-32 rounded bg-zinc-800/80" />
            <div className="h-3 w-full rounded bg-zinc-900/80" />
            <div className="h-3 w-5/6 rounded bg-zinc-900/80" />
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="h-20 rounded-lg bg-zinc-900/80" />
              <div className="h-20 rounded-lg bg-zinc-900/80" />
            </div>
          </div>
          <div className="space-y-3 rounded-2xl border border-zinc-800/70 bg-zinc-950/80 p-4">
            <div className="h-4 w-40 rounded bg-zinc-800/80" />
            <div className="h-32 rounded-lg bg-zinc-900/80" />
            <div className="h-3 w-2/3 rounded bg-zinc-900/80" />
          </div>
        </div>
      </div>
    </main>
  );
}
