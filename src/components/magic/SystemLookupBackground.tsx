import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  enableScan?: boolean;
};

export function SystemLookupBackground({ children, enableScan = true }: Props) {
  return (
    <div className="relative min-h-[60vh] overflow-hidden rounded-2xl border border-zinc-800/70 bg-black/95 px-6 py-8 shadow-[0_0_28px_rgba(24,24,27,0.7)] backdrop-blur-sm transition-all duration-500 hover:-translate-y-0.5 hover:border-zinc-600/80 hover:shadow-[0_0_40px_rgba(24,24,27,0.85)]">
      {enableScan && (
        <>
          <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,_rgba(127,29,29,0.35),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.2),_transparent_70%)] blur-2xl animate-system-glow" />
          <div className="pointer-events-none absolute inset-y-0 -z-10 w-1/3 bg-gradient-to-r from-emerald-400/0 via-emerald-400/18 to-emerald-400/0 blur-md animate-system-scan" />
        </>
      )}
      <div className="relative z-0">{children}</div>
    </div>
  );
}
