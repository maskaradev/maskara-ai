import { z } from "zod"

export const ENTITY_TYPES = [
  "PERSON", "DATE", "AGE", "PHONE", "EMAIL", "SSN", "ID_NUMBER", "ADDRESS", "ZIP", "LOCATION", "ORGANIZATION", "OTHER",
] as const

export const PERSON_ROLES = ["patient", "relative", "provider", "staff", "other"] as const

export const DetectionSchema = z.object({
  entities: z.array(
    z.object({
      text: z.string(),
      type: z.enum(ENTITY_TYPES),
      role: z.enum(PERSON_ROLES).nullable(),
      canonicalName: z.string().nullable(),
      relation: z.string().nullable(),
    }),
  ),
})

export const DetectRequestSchema = z.object({
  text: z.string().min(1).max(20_000),
  context: z.object({
    patientName: z.string().nullable(),
    providers: z.array(z.string()).max(50),
    source: z.enum(["clinical_text", "ocr", "transcript"]),
  }),
})

export type DetectRequest = z.infer<typeof DetectRequestSchema>
