/** @type {import('next').NextConfig} */
function resolveBackendUrl() {
  let url = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8000";
  url = url.trim().replace(/\/+$/, "");
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  return url;
}

const backendUrl = resolveBackendUrl();

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`
      },
      {
        source: "/health",
        destination: `${backendUrl}/health`
      },
      {
        source: "/ready",
        destination: `${backendUrl}/ready`
      }
    ];
  }
};

module.exports = nextConfig;
