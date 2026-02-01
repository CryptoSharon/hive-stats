// Build script for Vercel deployment
import { existsSync, cpSync, rmSync } from "fs";

console.log("🔨 Building Hive Stats Dashboard for production...\n");

// 1. Clean dist folder
if (existsSync("dist")) {
  rmSync("dist", { recursive: true });
}

// 2. Build the frontend with Bun
const result = await Bun.build({
  entrypoints: ["./frontend.tsx"],
  outdir: "./public",
  naming: {
    entry: "app.js",
    chunk: "[name]-[hash].js",
    asset: "[name]-[hash][ext]",
  },
  minify: true,
  target: "browser",
  sourcemap: "none",
  splitting: false,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

if (!result.success) {
  console.error("❌ Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("✅ Built frontend bundle");

// 3. Copy CSS to public
cpSync("./styles.css", "./public/styles.css");
console.log("✅ Copied styles.css");

// 4. Copy public folder to dist
cpSync("./public", "./dist", { recursive: true });
console.log("✅ Copied to dist/");

console.log("\n🎉 Build complete! Output in ./dist folder");
console.log("   Run `bunx vercel` to deploy");
