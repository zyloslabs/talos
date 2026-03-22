/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  skipTrailingSlashRedirect: true,
  async rewrites() {
    const apiBase = process.env.TALOS_API_BASE || "http://localhost:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
      {
        source: "/socket.io/",
        destination: `${apiBase}/socket.io/`,
      },
      {
        source: "/socket.io/:path*",
        destination: `${apiBase}/socket.io/:path*`,
      },
    ];
  },
};

export default nextConfig;
