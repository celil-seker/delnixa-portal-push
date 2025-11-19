/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  async rewrites() {
    return [
      {
        // 🟢 Merkezî hesap API yönlendirmesi
        source: "/api/:path*",
        destination: "http://delnixa-portal-api-1:8000/:path*",
      },
      {
        // 🧩 Eski /login çağrılarını otomatik düzelt
        source: "/login",
        destination: "http://delnixa-portal-api-1:8000/central/login",
      },
      {
        // 🧩 API çağrısı biçimindeyse onu da düzelt
        source: "/api/login",
        destination: "http://delnixa-portal-api-1:8000/central/login",
      },
    ];
  },
};

export default nextConfig;
