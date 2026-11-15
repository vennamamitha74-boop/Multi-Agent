/** @type {import('next').NextConfig} */
function resolveBackendUrl() {
  let url =
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "https://multi-agent-backend-06ve.onrender.com";
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
