import NextAuth from "next-auth"
import EveOnline from "next-auth/providers/eveonline"
import Credentials from "next-auth/providers/credentials"
import { JWT } from "next-auth/jwt"

// Scopes from your requirements
const SCOPES = [
  "esi-wallet.read_character_wallet.v1",
  "esi-location.read_location.v1",
  "esi-search.search_structures.v1",
  "esi-universe.read_structures.v1",
  "esi-characters.read_blueprints.v1",
  "esi-calendar.respond_calendar_events.v1",
  "esi-calendar.read_calendar_events.v1",
  "esi-location.read_ship_type.v1",
  "esi-mail.organize_mail.v1",
  "esi-mail.read_mail.v1",
  "esi-mail.send_mail.v1",
  "esi-skills.read_skills.v1",
  "esi-skills.read_skillqueue.v1",
  "esi-wallet.read_corporation_wallet.v1",
  "esi-clones.read_clones.v1",
  "esi-characters.read_contacts.v1",
  "esi-killmails.read_killmails.v1",
  "esi-corporations.read_corporation_membership.v1",
  "esi-assets.read_assets.v1",
  "esi-planets.manage_planets.v1",
  "esi-fleets.read_fleet.v1",
  "esi-fleets.write_fleet.v1",
  "esi-ui.open_window.v1",
  "esi-ui.write_waypoint.v1",
  "esi-characters.write_contacts.v1",
  "esi-fittings.read_fittings.v1",
  "esi-fittings.write_fittings.v1",
  "esi-markets.structure_markets.v1",
  "esi-corporations.read_structures.v1",
  "esi-characters.read_loyalty.v1",
  "esi-characters.read_chat_channels.v1",
  "esi-characters.read_medals.v1",
  "esi-characters.read_standings.v1",
  "esi-characters.read_agents_research.v1",
  "esi-industry.read_character_jobs.v1",
  "esi-markets.read_character_orders.v1",
  "esi-characters.read_corporation_roles.v1",
  "esi-location.read_online.v1",
  "esi-contracts.read_character_contracts.v1",
  "esi-clones.read_implants.v1",
  "esi-characters.read_fatigue.v1",
  "esi-killmails.read_corporation_killmails.v1",
  "esi-corporations.track_members.v1",
  "esi-wallet.read_corporation_wallets.v1",
  "esi-characters.read_notifications.v1",
  "esi-corporations.read_divisions.v1",
  "esi-corporations.read_contacts.v1",
  "esi-assets.read_corporation_assets.v1",
  "esi-corporations.read_titles.v1",
  "esi-corporations.read_blueprints.v1",
  "esi-contracts.read_corporation_contracts.v1",
  "esi-corporations.read_standings.v1",
  "esi-corporations.read_starbases.v1",
  "esi-industry.read_corporation_jobs.v1",
  "esi-markets.read_corporation_orders.v1",
  "esi-corporations.read_container_logs.v1",
  "esi-industry.read_character_mining.v1",
  "esi-industry.read_corporation_mining.v1",
  "esi-planets.read_customs_offices.v1",
  "esi-corporations.read_facilities.v1",
  "esi-corporations.read_medals.v1",
  "esi-characters.read_titles.v1",
  "esi-alliances.read_contacts.v1",
  "esi-characters.read_fw_stats.v1",
  "esi-corporations.read_fw_stats.v1",
  "esi-corporations.read_projects.v1",
  "esi-corporations.read_freelance_jobs.v1",
  "esi-characters.read_freelance_jobs.v1"
].join(" ")

const MOCK_MODE = process.env.NEXT_PUBLIC_MOCK_MODE === 'true'

if (!MOCK_MODE) {
  if (!process.env.EVE_CLIENT_ID) throw new Error("Missing EVE_CLIENT_ID")
  if (!process.env.EVE_CLIENT_SECRET) throw new Error("Missing EVE_CLIENT_SECRET")
  if (!process.env.AUTH_SECRET) throw new Error("Missing AUTH_SECRET")
} else {
  console.log("🔧 MOCK MODE ENABLED - Using test credentials")
}

console.log("Update your EVE Portal configuration to use the new redirect URI: .../callback/eve")

async function refreshAccessToken(token: JWT): Promise<JWT> {
  try {
    console.log("Refreshing EVE access token...")
    const url = "https://login.eveonline.com/v2/oauth/token"
    if (!token.refreshToken) throw new Error("No refresh token available")

    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.EVE_CLIENT_ID}:${process.env.EVE_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    })

    const refreshedTokens = await response.json()

    if (!response.ok) {
      throw refreshedTokens
    }

    return {
      ...token,
      accessToken: refreshedTokens.access_token,
      expiresAt: Math.floor(Date.now() / 1000 + refreshedTokens.expires_in),
      refreshToken: refreshedTokens.refresh_token ?? token.refreshToken, // Fallback to old refresh token
    }
  } catch (error) {
    console.error("Error refreshing access token", error)
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

function parseJwt(token: string) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString())
  } catch (e) {
    return null
  }
}

export const nextAuth = NextAuth({
  providers: [
    ...(MOCK_MODE ? [
      Credentials({
        id: "mock",
        name: "Mock Mode",
        credentials: {},
        async authorize() {
          return {
            id: "mock-user",
            name: "Test Pilot",
            sub: "CHARACTER:EVE:93686951",
            owner: "mock-owner-hash",
          }
        },
      }),
    ] : []),
    EveOnline({
      id: "eve", // Force provider ID to 'eve' -> callback: .../callback/eve
      name: "EVE Online",
      clientId: process.env.EVE_CLIENT_ID || "mock",
      clientSecret: process.env.EVE_CLIENT_SECRET || "mock",
      issuer: "https://login.eveonline.com",
      authorization: {
        url: "https://login.eveonline.com/v2/oauth/authorize",
        params: {
          scope: SCOPES,
        },
      },
      token: "https://login.eveonline.com/v2/oauth/token",
      userinfo: "https://login.eveonline.com/oauth/verify",
    }),
  ],
  debug: true, // Enable NextAuth debugging
  callbacks: {
    async jwt({ token, account, profile, user }) {
      // Mock mode sign in
      if (MOCK_MODE && user) {
        return {
          accessToken: "mock-access-token",
          refreshToken: "mock-refresh-token",
          expiresAt: Math.floor(Date.now() / 1000) + 86400,
          characterId: "93686951",
          name: "Test Pilot",
        } as JWT
      }

      // Initial sign in
      if (account && profile) {
        console.log("Initial Sign In Profile:", JSON.stringify(profile, null, 2))
        return {
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          characterId: profile.sub?.split(":").pop(),
          name: profile.name,
          ownerHash: profile.owner as string | undefined,
        } as JWT
      }

      // Fallback: If characterId is missing but we have accessToken, extract it
      if (!token.characterId && token.accessToken && !token.accessToken.startsWith("mock")) {
        const payload = parseJwt(token.accessToken)
        if (payload) {
          if (payload.sub) {
            token.characterId = payload.sub.split(":").pop()
            token.name = payload.name
            console.log("Recovered Character ID from Access Token:", token.characterId)
          }
          if (payload.scp) {
             console.log("Token Scopes:", payload.scp)
          }
        }
      }

      // Return previous token if the access token has not expired yet
      if (typeof token.expiresAt === 'number' && Date.now() < token.expiresAt * 1000) {
        return token
      }

      // Access token has expired, try to update it
      return MOCK_MODE ? token : refreshAccessToken(token)
    },
    async session({ session, token }) {
      // Expose the access token and character ID to the client session
      // Note: In a real app, you might want to be careful exposing the access token client-side
      // if you are doing all ESI calls server-side. But for a "terminal" app, it's often needed.
      if (token) {
        session.user.characterId = token.characterId as string | undefined
        session.user.accessToken = token.accessToken as string | undefined
        session.user.error = token.error as string | undefined
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
})

export const { handlers, auth, signIn, signOut } = nextAuth
