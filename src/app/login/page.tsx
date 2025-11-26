import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginButton } from "@/components/LoginButton"

export default function LoginPage() {
  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-black text-white">
      {/* Background Effects */}
      <div className="absolute inset-0 z-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-black to-black" />
        <div className="h-full w-full bg-[url('https://web.ccpgamescdn.com/aws/eveonline/images/backgrounds/wormhole_bg.jpg')] bg-cover bg-center opacity-20 blur-[2px]" />
      </div>

      <Card className="z-10 w-[350px] border-slate-800 bg-black/50 backdrop-blur-xl text-slate-200 shadow-2xl shadow-cyan-500/10">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold tracking-tighter text-white">
            TACTICAL NARCOTICS
          </CardTitle>
          <CardDescription className="text-slate-400">
            Division Terminal Access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginButton />
          <div className="mt-4 text-center text-xs text-slate-500">
            <p>Restricted Access. Authorized Personnel Only.</p>
            <p className="mt-1 font-mono">SEC_LEVEL: NULL_SEC</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
