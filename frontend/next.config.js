/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: process.env.NEXT_PUBLIC_BACKEND_URL 
          ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/:path*`
          : "http://127.0.0.1:8000/api/:path*"
      },
      {
        source: "/health",
        destination: process.env.NEXT_PUBLIC_BACKEND_URL 
          ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/health`
          : "http://127.0.0.1:8000/health"
      },
      {
        source: "/ready",
        destination: process.env.NEXT_PUBLIC_BACKEND_URL 
          ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/ready`
          : "http://127.0.0.1:8000/ready"
      }
    ];
  }
};

module.exports = nextConfig;
