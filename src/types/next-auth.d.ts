import { DefaultSession } from "next-auth"

declare module "next-auth" {
  /**
   * Returned by `auth`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface Session {
    user: {
      characterId?: string
      accessToken?: string
      error?: string
    } & DefaultSession["user"]
  }

  interface Profile {
    sub?: string
    name?: string
    owner?: string
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `auth` */
  interface JWT {
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    characterId?: string
    name?: string
    ownerHash?: string
    error?: string
  }
}
