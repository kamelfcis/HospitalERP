/**
 * server/index.ts — نقطة دخول الخادم (Node طويل الأمد)
 *
 * يستورد التهيئة من bootstrap-app.ts — نفس المنطق يُستخدم على Vercel عبر api/index.ts
 */

import "dotenv/config";
import { logger } from "./lib/logger";

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
  logger.fatal({ err: msg }, "[FATAL] unhandledRejection");
  console.error("[FATAL] unhandledRejection\n", msg);
  process.exit(1);
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err: err.message, stack: err.stack }, "[FATAL] uncaughtException");
  console.error("[FATAL] uncaughtException\n", err);
  process.exit(1);
});

import { bootstrapApp, log } from "./bootstrap-app";

(async () => {
  try {
    const { httpServer } = await bootstrapApp();

    const port = parseInt(process.env.PORT || "5000", 10);
    const listenOpts =
      process.platform === "win32"
        ? ({ port, host: "0.0.0.0" } as const)
        : ({ port, host: "0.0.0.0", reusePort: true } as const);

    await new Promise<void>((resolve, reject) => {
      const onErr = (err: Error) => {
        httpServer.off("error", onErr);
        reject(err);
      };
      httpServer.once("error", onErr);
      httpServer.listen(listenOpts, () => {
        httpServer.off("error", onErr);
        log(`serving on port ${port}`);
        resolve();
      });
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack   = err instanceof Error ? err.stack : undefined;
    logger.fatal({ err: message, stack }, "[FATAL STARTUP] listen failed");
    process.exit(1);
  }
})();

/** يُعاد تصديره للتوافق مع أي استيراد قديم من هذا الملف */
export { log } from "./bootstrap-app";
