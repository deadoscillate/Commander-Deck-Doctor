import { withSentryConfig } from "@sentry/nextjs";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https://*.scryfall.io",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "connect-src 'self' https: ws: wss:"
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./data/scryfall/oracle-cards.compiled.json",
      "./data/scryfall/default-cards.compiled.json.gz",
      "./data/scryfall/prints.compiled.sqlite",
      "./data/scryfall/print-index/**/*"
    ],
    "/api/**/*": [
      "./data/scryfall/oracle-cards.compiled.json",
      "./data/scryfall/default-cards.compiled.json.gz",
      "./data/scryfall/prints.compiled.sqlite",
      "./data/scryfall/print-index/**/*"
    ]
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
        ]
      }
    ];
  }
};

const sentryWebpackPluginOptions = {
  silent: true,
  webpack: {
    treeshake: {
      removeDebugLogging: true
    }
  }
};

export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
