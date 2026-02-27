/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["ml-uikit"],
  // experimental: {
  //   esmExternals: "loose",
  // },
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "ml-uikit$": "ml-uikit/dist/index.es.js",
    };
    return config;
  },
};

module.exports = nextConfig;
