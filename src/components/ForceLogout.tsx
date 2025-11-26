"use client"

import { signOut } from "next-auth/react"
import { useEffect } from "react"

export function ForceLogout() {
  useEffect(() => {
    signOut({ callbackUrl: "/login" })
  }, [])

  return (
    <div className="flex h-screen items-center justify-center bg-black text-red-500 font-mono">
      SESSION INVALID - RESETTING...
    </div>
  )
}
