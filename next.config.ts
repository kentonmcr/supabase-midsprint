import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Derived from the public Supabase project URL so the CSP stays correct if
// the project ever changes — safe to read directly, this env var is meant
// to be public (see CLAUDE.md's NEXT_PUBLIC_SUPABASE_URL note).
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

// No nonces — this app has no third-party/inline scripts beyond what
// Next.js and shadcn/Radix need, so the simpler static CSP from Next.js's
// "Without Nonces" guide is enough; nonces would force every page into
// dynamic rendering for no real benefit here.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data: ${supabaseOrigin};
  font-src 'self';
  connect-src 'self' ${supabaseOrigin};
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`;

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\s{2,}/g, " ").trim(),
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
