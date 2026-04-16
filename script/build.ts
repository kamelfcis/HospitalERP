import path from "node:path";
import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { cp, rm, readFile } from "fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  // Vercel serves static files from `public/` at the edge; Fluid Express never runs express.static().
  if (process.env.VERCEL === "1") {
    const root = path.resolve(import.meta.dirname, "..");
    const built = path.join(root, "dist", "public");
    const pub = path.join(root, "public");
    console.log("vercel: syncing dist/public → public/ …");
    await rm(pub, { recursive: true, force: true });
    await cp(built, pub, { recursive: true });
  }

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Dedicated bootstrap bundle for Vercel API catch-all runtime.
  // This avoids Node ESM extension-resolution issues in serverless.
  await esbuild({
    entryPoints: ["server/bootstrap-app.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/bootstrap-app.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
