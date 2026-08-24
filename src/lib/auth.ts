import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";

import { getServerEnvironment } from "@/lib/env";
import { prisma } from "@/lib/prisma";

const environment = getServerEnvironment();

export const auth = betterAuth({
  appName: "ParcelTrack Admin",
  baseURL: environment.canonicalOrigin,
  secret: environment.authSecret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 30,
    customRules: {
      "/sign-in/email": {
        window: 60,
        max: 5,
      },
    },
  },
  trustedOrigins: environment.trustedOrigins,
  advanced: {
    useSecureCookies: environment.isProduction,
    database: {
      joins: false,
    },
  },
  plugins: [admin(), nextCookies()],
});
