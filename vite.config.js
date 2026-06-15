import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 渲染层(React) 构建配置；base 用相对路径以便 Electron 以 file:// 加载生产包。
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: { outDir: "dist-renderer", emptyOutDir: true },
});
