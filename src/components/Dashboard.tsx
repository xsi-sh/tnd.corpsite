import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import { LogoutButton } from "@/components/LogoutButton"
import { ForceLogout } from "@/components/ForceLogout"
import { EsiClient } from "@/lib/esi-sdk/client"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { DashboardStats } from "./DashboardStats"

export async function Dashboard() {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }

  if (!session.user.characterId || isNaN(Number(session.user.characterId))) {
    console.error("Invalid Character ID in session:", session.user)
    return <ForceLogout />
  }

  // Initialize ESI Client
  const esi = new EsiClient({
    userAgent: process.env.NEXT_PUBLIC_ESI_USER_AGENT || "Tactical Narcotics Division/1.0.0",
    token: session.user.accessToken,
  })

  const charId = Number(session.user.characterId)

  if (isNaN(charId)) {
    console.error("Invalid Character ID:", session.user.characterId)
    return <div className="text-red-500">Error: Invalid Character ID</div>
  }

  // Parallel fetch with error tolerance
  const results = await Promise.allSettled([
    esi.getCharacter({ character_id: charId }),
    esi.getCharacterWallet({ character_id: charId }),
    esi.getCharacterLocation({ character_id: charId }),
    esi.getCharacterShip({ character_id: charId }),
    esi.getCharacterSkills({ character_id: charId }),
    esi.getCharacterAssets({ character_id: charId, page: 1 }),
    esi.getCharacterWalletJournal({ character_id: charId }),
    esi.getCharacterWalletTransactions({ character_id: charId }),
    esi.getMarketsPrices()
  ])

  const publicInfo = results[0].status === 'fulfilled' ? results[0].value.data : { birthday: new Date().toISOString(), corporation_id: 0 }
  const wallet = results[1].status === 'fulfilled' ? results[1].value.data : 0
  const location = results[2].status === 'fulfilled' ? results[2].value.data : { solar_system_id: 0, station_id: 0 }
  const ship = results[3].status === 'fulfilled' ? results[3].value.data : { ship_name: 'Unknown', ship_type_id: 0 }
  const skills = results[4].status === 'fulfilled' ? results[4].value.data : { total_sp: 0, unallocated_sp: 0 }
  const assets = results[5].status === 'fulfilled' ? results[5].value.data : []
  const journal = results[6].status === 'fulfilled' ? results[6].value.data : []
  const transactions = results[7].status === 'fulfilled' ? results[7].value.data : []
  const prices = results[8].status === 'fulfilled' ? results[8].value.data : []

  // Calculations
  const plexCount = assets.filter(a => a.type_id === 44992).reduce((acc, a) => acc + a.quantity, 0)
  
  // Asset Valuation
  const priceMap = new Map(prices.map(p => [p.type_id, p.average_price || p.adjusted_price || 0]))
  const assetWorth = assets.reduce((acc, asset) => {
    const price = priceMap.get(asset.type_id) || 0
    return acc + (price * asset.quantity)
  }, 0)
  
  // Financials (Last 30 Days from Journal)
  const now = new Date()
  const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30))
  const recentJournal = journal.filter(j => new Date(j.date) > thirtyDaysAgo)
  
  const income = recentJournal.filter(j => (j.amount || 0) > 0).reduce((acc, j) => acc + (j.amount || 0), 0)
  const expense = recentJournal.filter(j => (j.amount || 0) < 0).reduce((acc, j) => acc + (j.amount || 0), 0)
  const net = income + expense

  // Log errors for debugging
  results.forEach((res, index) => {
    if (res.status === 'rejected') {
      console.error(`ESI Request ${index} failed:`, res.reason)
    }
  })

  return (
    <>
      <header className="flex items-center justify-between mb-12 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-cyan-500">T.N.D. TERMINAL</h1>
          <p className="text-zinc-500 text-sm mt-1">SECURE CONNECTION ESTABLISHED</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm font-bold">{session.user.name}</p>
            <p className="text-xs text-zinc-500">{publicInfo.corporation_id}</p>
          </div>
          <Image 
            src={`https://images.evetech.net/characters/${charId}/portrait?size=64`} 
            alt="Character Portrait" 
            width={64}
            height={64}
            className="rounded border border-zinc-700"
            unoptimized 
          />
          <LogoutButton />
        </div>
      </header>

      <DashboardStats 
        wallet={wallet}
        net={net}
        income={income}
        expense={expense}
        assetWorth={assetWorth}
        plexCount={plexCount}
        location={location}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
        {/* Ship Info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-400 text-sm">ACTIVE SHIP</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl text-white truncate">{ship.ship_name}</div>
            <p className="text-xs text-zinc-500 mt-1">Type ID: {ship.ship_type_id}</p>
          </CardContent>
        </Card>

        {/* Skills Info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-400 text-sm">SKILL POINTS</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-400">
              {skills.total_sp.toLocaleString()}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              Unallocated: {skills.unallocated_sp?.toLocaleString() || 0}
            </p>
          </CardContent>
        </Card>

        {/* Assets Info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-400 text-sm">ASSETS (Page 1)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-400">
              {assets.length.toLocaleString()} Items
            </div>
          </CardContent>
        </Card>

        {/* Birthday Info */}
        <Card className="bg-zinc-900 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-zinc-400 text-sm">BIRTHDAY</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg">
               {new Date(publicInfo.birthday).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions */}
      <Card className="bg-zinc-900 border-zinc-800 mb-8">
        <CardHeader>
          <CardTitle className="text-zinc-400 text-sm">RECENT TRANSACTIONS</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-zinc-500 border-b border-zinc-800">
                <tr>
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Type ID</th>
                  <th className="pb-2">Quantity</th>
                  <th className="pb-2">Price</th>
                  <th className="pb-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="text-zinc-300">
                {transactions.slice(0, 10).map((tx, i) => (
                  <tr key={i} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors">
                    <td className="py-2">{new Date(tx.date).toLocaleDateString()}</td>
                    <td className="py-2">{tx.type_id}</td>
                    <td className="py-2">{tx.quantity.toLocaleString()}</td>
                    <td className="py-2">{tx.unit_price.toLocaleString()}</td>
                    <td className={`py-2 text-right font-mono ${tx.is_buy ? 'text-red-400' : 'text-emerald-400'}`}>
                      {tx.is_buy ? '-' : '+'}{(tx.quantity * tx.unit_price).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-zinc-600 italic">
                      No recent transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-12 p-4 border border-dashed border-zinc-800 rounded bg-zinc-900/50">
        <h3 className="text-sm font-bold text-zinc-500 mb-2">DEBUG INFO</h3>
        <pre className="text-xs overflow-auto max-h-40 text-zinc-600">
          {JSON.stringify({ session, publicInfo, location }, null, 2)}
        </pre>
      </div>
    </>
  )
}
