"use client"

import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { useEffect } from "react"

export function LoginButton() {
  const mockMode = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

  useEffect(() => {
    if (mockMode) {
      // Auto-login in mock mode
      signIn("mock", { callbackUrl: "/" })
    }
  }, [mockMode])

  return (
    <Button 
      onClick={() => signIn(mockMode ? "mock" : "eve", { callbackUrl: "/" })}
      className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold tracking-wide transition-all hover:shadow-[0_0_20px_rgba(8,145,178,0.5)]"
    >
      {mockMode ? "MOCK LOGIN" : "LOGIN WITH EVE ONLINE"}
    </Button>
  )
}
