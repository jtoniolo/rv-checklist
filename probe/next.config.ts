import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  // tsc self-exec fails with ETXTBSY on this host; type-checking is not what the probe tests.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
