import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JsonWorkerLogger } from "./logger.js";
import { runWorkerOnce } from "./worker.js";

function isEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && pathToFileURL(resolve(entrypoint)).href === import.meta.url;
}

const DEFAULT_POLL_INTERVAL_SECONDS = 300;
const MIN_POLL_INTERVAL_SECONDS = 60;

function readWorkerMode(): "loop" | "once" {
  const mode = process.env["WORKER_MODE"]?.toLowerCase();
  return mode === "once" ? "once" : "loop";
}

function readPollIntervalMs(): number {
  const raw = process.env["WORKER_POLL_INTERVAL_SECONDS"];
  const seconds =
    raw !== undefined
      ? Math.max(Number(raw) || DEFAULT_POLL_INTERVAL_SECONDS, MIN_POLL_INTERVAL_SECONDS)
      : DEFAULT_POLL_INTERVAL_SECONDS;
  return seconds * 1_000;
}

async function runLoop(): Promise<void> {
  const logger = new JsonWorkerLogger({ level: "info" });
  const intervalMs = readPollIntervalMs();
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function scheduleNext(): void {
    if (stopping) return;
    timer = setTimeout(() => void tick(), intervalMs);
  }

  async function tick(): Promise<void> {
    if (stopping) return;
    const started = Date.now();
    try {
      const result = await runWorkerOnce();
      logger.write("info", "Worker loop iteration completed", {
        event: "worker_loop_tick",
        processed_jobs: result.processedJobs,
        duration_ms: Date.now() - started,
      });
    } catch (error: unknown) {
      logger.write("error", "Worker loop iteration failed", {
        event: "worker_loop_tick_failed",
        error_name: error instanceof Error ? error.name : "UnknownError",
        duration_ms: Date.now() - started,
      });
    }
    scheduleNext();
  }

  function shutdown(signal: string): void {
    if (stopping) return;
    stopping = true;
    if (timer !== undefined) clearTimeout(timer);
    logger.write("info", "Worker loop shutting down", {
      event: "worker_loop_shutdown",
      signal,
    });
    process.exitCode = 0;
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.write("info", "Worker loop started", {
    event: "worker_loop_started",
    poll_interval_seconds: intervalMs / 1_000,
  });

  await tick();
}

if (isEntrypoint()) {
  const mode = readWorkerMode();
  if (mode === "once") {
    void runWorkerOnce().catch((error: unknown) => {
      const logger = new JsonWorkerLogger({ level: "info" });
      logger.write("fatal", "Worker bootstrap failed", {
        event: "worker_bootstrap_failed",
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
      process.exitCode = 1;
    });
  } else {
    void runLoop().catch((error: unknown) => {
      const logger = new JsonWorkerLogger({ level: "info" });
      logger.write("fatal", "Worker loop bootstrap failed", {
        event: "worker_loop_bootstrap_failed",
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
      process.exitCode = 1;
    });
  }
}

export { runWorkerOnce } from "./worker.js";
