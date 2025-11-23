import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export function RoutePlannerBackground({ children }: Props) {
  return (
    <div className="relative min-h-[60vh] overflow-hidden rounded-2xl border border-zinc-800/70 bg-black/95 px-4 py-6 shadow-[0_0_32px_rgba(15,23,42,0.85)] backdrop-blur-sm sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.32),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(129,140,248,0.25),_transparent_70%)] blur-2xl animate-system-glow" />
      <div className="pointer-events-none absolute inset-y-0 -z-10 w-1/2 bg-gradient-to-r from-sky-400/0 via-sky-400/28 to-sky-400/0 blur-md animate-system-scan" />
      <div className="relative z-0">{children}</div>
    </div>
  );
}
