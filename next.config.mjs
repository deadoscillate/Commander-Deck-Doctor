import { withSentryConfig } from "@sentry/nextjs";

function buildContentSecurityPolicy() {
  const isProduction = process.env.NODE_ENV === "production";
  const scriptSources = ["'self'", "'unsafe-inline'"];
  const connectSources = [
    "'self'",
    "https://api.scryfall.com",
    "https://*.scryfall.io",
    "https://*.ingest.sentry.io",
    "https://*.sentry.io"
  ];

  if (!isProduction) {
    scriptSources.push("'unsafe-eval'");
    connectSources.push("ws:", "wss:", "http://localhost:*", "http://127.0.0.1:*");
  }

  const policy = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: https://*.scryfall.io",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSources.join(" ")}`,
    `connect-src ${connectSources.join(" ")}`
  ];

  if (isProduction) {
    policy.push("upgrade-insecure-requests");
  }

  return policy.join("; ");
}

const contentSecurityPolicy = buildContentSecurityPolicy();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cards.scryfall.io"
      },
      {
        protocol: "https",
        hostname: "api.scryfall.com"
      }
    ]
  },
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./data/scryfall/oracle-cards.compiled.json",
      "./data/scryfall/default-cards.compiled.json.gz",
      "./data/scryfall/prints.compiled.sqlite",
      "./data/scryfall/print-index/**/*",
      "./data/precons/commander-precons.json"
    ],
    "/api/**/*": [
      "./data/scryfall/oracle-cards.compiled.json",
      "./data/scryfall/default-cards.compiled.json.gz",
      "./data/scryfall/prints.compiled.sqlite",
      "./data/scryfall/print-index/**/*",
      "./data/precons/commander-precons.json"
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
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
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
