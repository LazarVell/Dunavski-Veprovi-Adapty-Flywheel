import type { NextConfig } from "next";

/** The app's own saved state and images: written while it runs, never part of the build. */
const DEMO_CACHE = /[\\/]data[\\/]demo-cache[\\/]/;

const nextConfig: NextConfig = {
  // Dev only: keep compiled routes loaded for an hour. By default Next disposes a route after ~60s idle,
  // and a model call can take longer than that, so the next request to the same route got a 404.
  onDemandEntries: { maxInactiveAge: 60 * 60 * 1000, pagesBufferLength: 20 },
  // Dev only: don't watch data/demo-cache. Each write there (a saved language, a new picture) triggered a
  // recompile, and a request arriving during it got a 404.
  webpack(config) {
    const prev = config.watchOptions?.ignored;
    const ignored =
      prev instanceof RegExp
        ? new RegExp(`${prev.source}|${DEMO_CACHE.source}`)
        : [...(Array.isArray(prev) ? prev : typeof prev === "string" ? [prev] : []), "**/data/demo-cache/**"];
    config.watchOptions = { ...config.watchOptions, ignored };
    return config;
  },
};

export default nextConfig;
