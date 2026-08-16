import {
  Inject,
  Injectable,
  Optional,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import type { ApiConfig } from "@anc/config";
import { DeviceTokenCrypto, type DatabasePool } from "@anc/database";
import { API_CONFIG, CLOCK, DATABASE_POOL } from "../infrastructure/tokens.js";
import { JsonLogger } from "../observability/json-logger.js";
import type { Clock } from "../auth/staff-auth.service.js";
import { createFcmPushAdapter, type PushDeliveryAdapter } from "./push-adapter.js";
import {
  localDateString,
  processReminderCycles,
  type ReminderProcessingResult,
} from "./reminder-processor.js";
import { processPendingPushAttempts, type PushProcessingResult } from "./push-processor.js";

export type { PushDeliveryAdapter };

export const PUSH_DELIVERY_ADAPTER = Symbol("PUSH_DELIVERY_ADAPTER");

export interface SchedulerTickResult {
  readonly processedJobs: number;
  readonly reminderResult: ReminderProcessingResult;
  readonly pushResult: PushProcessingResult;
}

@Injectable()
export class InternalSchedulerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger: JsonLogger;
  private readonly tokenCrypto: DeviceTokenCrypto;
  private readonly pushAdapter: PushDeliveryAdapter;
  private timer: ReturnType<typeof setInterval> | undefined = undefined;
  private isTicking = false;
  private isStopping = false;

  public constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    @Inject(DATABASE_POOL) private readonly databasePool: DatabasePool,
    @Optional()
    @Inject(PUSH_DELIVERY_ADAPTER)
    pushAdapter?: PushDeliveryAdapter,
    @Optional()
    @Inject(CLOCK)
    private readonly clock?: Clock,
  ) {
    this.logger = new JsonLogger({
      service: "anc-api:scheduler",
      level: config.logLevel,
    });
    this.tokenCrypto = new DeviceTokenCrypto(config.pushTokenEncryptionKey);
    this.pushAdapter =
      pushAdapter ?? createFcmPushAdapter(config.fcmProjectId, config.fcmServiceAccountJson);
  }

  public onApplicationBootstrap(): void {
    if (this.config.schedulerEnabled === false) {
      this.logger.write("info", "Internal scheduler disabled by configuration", {
        event: "scheduler_disabled",
      });
      return;
    }

    const intervalMs = (this.config.schedulerIntervalSeconds ?? 300) * 1_000;
    this.logger.write("info", "Internal scheduler starting", {
      event: "scheduler_started",
      interval_seconds: this.config.schedulerIntervalSeconds ?? 300,
    });

    this.timer = setInterval(() => {
      void this.tick().catch((error) => {
        this.logger.write("error", "Internal scheduler tick execution failed", {
          event: "scheduler_tick_error",
          error_name: error instanceof Error ? error.name : "UnknownError",
        });
      });
    }, intervalMs);

    // Run initial tick after a brief 5-second bootstrap delay
    setTimeout(() => {
      if (!this.isStopping) {
        void this.tick().catch((error) => {
          this.logger.write("error", "Initial scheduler tick execution failed", {
            event: "scheduler_initial_tick_error",
            error_name: error instanceof Error ? error.name : "UnknownError",
          });
        });
      }
    }, 5_000);
  }

  public onApplicationShutdown(signal?: string): void {
    this.isStopping = true;
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.logger.write("info", "Internal scheduler stopped", {
      event: "scheduler_stopped",
      signal: signal ?? "graceful_shutdown",
    });
  }

  public async tick(executionNow?: Date): Promise<SchedulerTickResult> {
    if (this.isTicking) {
      this.logger.write("warn", "Previous scheduler tick still running; skipping iteration", {
        event: "scheduler_tick_skipped_concurrent",
      });
      return {
        processedJobs: 0,
        reminderResult: {
          createdCyclesCount: 0,
          pushAttemptsCount: 0,
          waFallbackActionsCount: 0,
        },
        pushResult: {
          processedAttemptsCount: 0,
          succeededCount: 0,
          retriesScheduledCount: 0,
          terminalFailuresCount: 0,
          waFallbackActionsCount: 0,
        },
      };
    }

    this.isTicking = true;
    const now = executionNow ?? (this.clock ? this.clock() : new Date());
    const started = Date.now();

    try {
      const anchorDate = localDateString(now, this.config.primaryTimezone);
      const reminderResult = await processReminderCycles(this.databasePool, anchorDate, {
        intervalDays: this.config.reminderIntervalDays,
        timezone: this.config.primaryTimezone,
      });

      const pushResult = await processPendingPushAttempts(
        this.databasePool,
        this.pushAdapter,
        this.tokenCrypto,
        {
          maxAttempts: this.config.pushMaxAttempts,
          backoffSeconds: this.config.pushBackoffSeconds,
        },
        { now },
      );

      const processedJobs = reminderResult.createdCyclesCount + pushResult.processedAttemptsCount;

      this.logger.write("info", "Scheduler tick completed successfully", {
        event: "scheduler_tick_completed",
        processed_jobs: processedJobs,
        duration_ms: Date.now() - started,
        reminder_cycles_created: reminderResult.createdCyclesCount,
        push_attempts_created: reminderResult.pushAttemptsCount,
        wa_fallbacks_created: reminderResult.waFallbackActionsCount,
        push_attempts_processed: pushResult.processedAttemptsCount,
        push_attempts_succeeded: pushResult.succeededCount,
        push_retries_scheduled: pushResult.retriesScheduledCount,
        push_terminal_failures: pushResult.terminalFailuresCount,
      });

      return {
        processedJobs,
        reminderResult,
        pushResult,
      };
    } catch (error) {
      this.logger.write("error", "Scheduler tick encountered an unexpected error", {
        event: "scheduler_tick_failed",
        error_name: error instanceof Error ? error.name : "UnknownError",
        duration_ms: Date.now() - started,
      });
      throw error;
    } finally {
      this.isTicking = false;
    }
  }
}
