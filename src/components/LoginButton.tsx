"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"

export function LoginButton() {
  return (
    <Button 
      onClick={() => signIn("eve", { callbackUrl: "/" })}
      className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold tracking-wide transition-all hover:shadow-[0_0_20px_rgba(8,145,178,0.5)]"
    >
      LOGIN WITH EVE ONLINE
    </Button>
  )
}
