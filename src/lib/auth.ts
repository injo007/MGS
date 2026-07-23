/* eslint-disable @typescript-eslint/no-explicit-any */

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { sendAuditTelegramAlert } from "@/lib/telegram";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            hashedPassword: users.hashedPassword,
            image: users.image,
            roleId: users.roleId,
            status: users.status,
            roleName: roles.name,
          })
          .from(users)
          .innerJoin(roles, eq(users.roleId, roles.id))
          .where(eq(users.email, credentials.email as string))
          .limit(1);

        if (!user[0] || !user[0].hashedPassword) return null;
        if (user[0].status !== "active") return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user[0].hashedPassword
        );

        if (!isValid) return null;

        await db
          .update(users)
          .set({ lastLoginAt: new Date() })
          .where(eq(users.id, user[0].id));

        await sendAuditTelegramAlert({
          action: "login",
          entityType: "user",
          actorName: user[0].name,
          actorEmail: user[0].email,
          entityName: user[0].name,
          entityDetail: user[0].roleName,
        });

        return {
          id: user[0].id,
          name: user[0].name,
          email: user[0].email,
          image: user[0].image,
          roleId: user[0].roleId,
          roleName: user[0].roleName,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.roleId = (user as any).roleId;
        token.roleName = (user as any).roleName;
        token.image = (user as any).image;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).roleId = token.roleId;
        (session.user as any).roleName = token.roleName;
        session.user.image = token.image as string | null | undefined;
      }
      return session;
    },
  },
});
