/**
 * Vercel Fluid Express entry — one default export of the full Express app
 * (same bootstrap as `server/index.ts`, without `listen`).
 */
import "dotenv/config";

process.env.VERCEL ??= "1";

const { bootstrapApp } = await import("../server/bootstrap-app");
const { app } = await bootstrapApp();

export default app;
