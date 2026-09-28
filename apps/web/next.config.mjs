const BACKEND_URL = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@nexus/shared"],
  // The browser only ever talks to this same origin at /api/* — see the
  // comment in src/lib/api.ts for why (cross-subdomain cookies break on
  // most PaaS shared domains). This proxies that to the real API server.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${BACKEND_URL}/:path*` }];
  },
};

export default nextConfig;
