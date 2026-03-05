import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/analyze": ["./data/scryfall/oracle-cards.compiled.json"],
    "/api/**/*": ["./data/scryfall/oracle-cards.compiled.json"]
  },
  typescript: {
    tsconfigPath: "./tsconfig.build.json"
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
        ]
      }
    ];
  }
};

const sentryWebpackPluginOptions = {
  silent: true,
  disableLogger: true
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
