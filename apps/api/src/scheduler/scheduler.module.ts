import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { InternalSchedulerService } from "./scheduler.service.js";

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [InternalSchedulerService],
  exports: [InternalSchedulerService],
})
export class SchedulerModule {}
