import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';
import { db } from './db';
import { env } from './env';
import { logger } from './logger';

// Auth.js v5. Magic-link email primary + Google OAuth (if configured).
// Session cookies are HttpOnly+Secure+SameSite=Lax by default; we set explicit
// maxAge and enforce rotation via `updateAge`.
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: {
    strategy: 'database',
    maxAge: 60 * 60 * 24 * 30, // 30d
    updateAge: 60 * 60 * 24,   // refresh every 24h
  },
  secret: env.AUTH_SECRET,
  trustHost: true,
  pages: {
    signIn: '/login',
    verifyRequest: '/login/check-email',
    error: '/login/error',
  },
  providers: [
    ...(env.RESEND_API_KEY && env.EMAIL_FROM
      ? [
          Resend({
            apiKey: env.RESEND_API_KEY,
            from: env.EMAIL_FROM,
          }),
        ]
      : []),
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            // PKCE + state are handled by Auth.js; keep profile data minimal.
            allowDangerousEmailAccountLinking: false,
          }),
        ]
      : []),
  ],
  callbacks: {
    async session({ session, user }) {
      // Expose only non-sensitive fields on the session.
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
    async signIn({ user, account }) {
      logger.info({ userId: user.id, provider: account?.provider }, 'signIn');
      return true;
    },
  },
  events: {
    async signOut(message) {
      const userId = 'token' in message ? message.token?.sub : message.session?.userId;
      logger.info({ userId }, 'signOut');
    },
  },
});

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
