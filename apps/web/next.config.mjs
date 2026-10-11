/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@colophon/kernel", "@colophon/instruments", "@colophon/proof", "@colophon/verifier", "@colophon/watch"],
  reactStrictMode: true,
  images: { formats: ["image/avif", "image/webp"] },
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};

export default nextConfig;
