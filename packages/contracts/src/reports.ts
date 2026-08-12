import { z } from "zod";

export const villageReportItemSchema = z
  .object({
    village_id: z.string().uuid().nullable(),
    village_name: z.string().min(1).nullable(),
    total_mothers: z.number().int().min(0),
    active_pregnancies: z.number().int().min(0),
    confirmed_visits: z.number().int().min(0),
    validated_records: z.number().int().min(0),
  })
  .strict();
export type VillageReportItem = z.infer<typeof villageReportItemSchema>;

export const organizationReportResponseSchema = z
  .object({
    health_center_id: z.string().uuid(),
    generated_at: z.string().datetime({ offset: true }),
    total_mothers: z.number().int().min(0),
    total_active_pregnancies: z.number().int().min(0),
    total_confirmed_visits: z.number().int().min(0),
    total_validated_records: z.number().int().min(0),
    village_breakdown: z.array(villageReportItemSchema),
  })
  .strict();
export type OrganizationReportResponse = z.infer<typeof organizationReportResponseSchema>;
