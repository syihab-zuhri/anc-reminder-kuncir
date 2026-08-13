import { z } from "zod";

import { devicePlatformSchema, deviceStatusSchema } from "./domain.js";

export const registerAndroidDeviceRequestSchema = z
  .object({
    push_token: z
      .string()
      .trim()
      .min(20)
      .max(4096)
      .regex(/^\S+$/u, "Push token cannot contain spaces"),
  })
  .strict();

export const registeredDeviceResponseSchema = z
  .object({
    id: z.string().uuid(),
    platform: devicePlatformSchema,
    status: deviceStatusSchema,
    registered_at: z.string().datetime({ offset: true }),
    last_seen_at: z.string().datetime({ offset: true }),
  })
  .strict();

export type RegisterAndroidDeviceRequest = z.infer<typeof registerAndroidDeviceRequestSchema>;
export type RegisteredDeviceResponse = z.infer<typeof registeredDeviceResponseSchema>;
