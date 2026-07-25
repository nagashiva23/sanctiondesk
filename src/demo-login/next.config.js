/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Purely client-side lookup, no server logic at all -- safe to static-export
  // so this can be hosted anywhere (or just opened locally) for a demo.
  output: 'export',
  distDir: 'out',
};

export default nextConfig;
