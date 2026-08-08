import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JsonWorkerLogger } from "./logger.js";
import { runWorkerOnce } from "./worker.js";

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(resolve(entrypoint)).href === import.meta.url;
}

if (isEntrypoint()) {
  void runWorkerOnce().catch((error: unknown) => {
    const logger = new JsonWorkerLogger({ level: "info" });
    logger.write("fatal", "Worker bootstrap failed", {
      event: "worker_bootstrap_failed",
      error_name: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  });
}

export { runWorkerOnce } from "./worker.js";
