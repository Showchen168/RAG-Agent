import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署使用 standalone 模式，減少部署體積
  output: 'standalone',
  // pdf-parse 依賴 pdfjs-dist，其 worker 模組在 Turbopack 打包時無法正確解析
  // 將這些套件標記為外部套件，直接從 node_modules 載入
  serverExternalPackages: ['pdf-parse', 'pdfjs-dist', 'playwright', 'playwright-core'],
};

export default nextConfig;
