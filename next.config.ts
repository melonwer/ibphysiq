import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone', // Enable standalone output for Docker deployment
  images: {
    unoptimized: true, // Disable image optimization to avoid Sharp dependency
  },
  experimental: {
    optimizePackageImports: ["@radix-ui/react-select", "@radix-ui/react-collapsible", "lucide-react"]
  },
  // Production optimizations
  poweredByHeader: false,
  compress: true,
  generateEtags: false,
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ]
  }
};

export default nextConfig;
