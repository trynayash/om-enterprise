import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// No-nonce CSP (keeps pages prerenderable). React escapes all rendered data; inline scripts are
// limited to Next.js runtime bootstrapping. Razorpay QR images are allowed when that gateway is used.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data: https://rzp.io https://*.razorpay.com",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  // pdfkit reads its own font metric files at runtime; keep it out of the bundle.
  serverExternalPackages: ["pdfkit"],
  // Never ship secrets, backups, uploads or dev-only files in the standalone server bundle.
  outputFileTracingExcludes: {
    "/**": [
      "./.env*",
      "./backups/**",
      "./storage/**",
      "./tests/**",
      "./test-results/**",
      "./playwright-report/**",
      "./scripts/**",
    ],
  },
  outputFileTracingIncludes: {
    "/api/documents/[id]/pdf": ["./assets/fonts/**"],
    "/d/[token]/pdf": ["./assets/fonts/**"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      { source: "/(dashboard|pos|account|login)(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
