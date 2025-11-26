import { Suspense } from "react"
import { Dashboard } from "@/components/Dashboard"

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 p-8 text-zinc-100 font-mono">
      <Suspense fallback={<div className="text-cyan-500 animate-pulse">INITIALIZING TERMINAL...</div>}>
        <Dashboard />
      </Suspense>
    </div>
  )
}
