import bundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["@napi-rs/canvas", "sharp"],
  async headers() {
    const focusHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ];

    return [
      {
        source:
          "/teacher/banks/:bankId/questions/:bankQuestionId/preview",
        headers: focusHeaders,
      },
      {
        source: "/teacher/banks/:bankId/review/:reviewItemId",
        headers: focusHeaders,
      },
    ];
  },
};

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

export default withBundleAnalyzer(nextConfig);
