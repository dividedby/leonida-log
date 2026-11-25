import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native module: load from node_modules at runtime, don't bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
