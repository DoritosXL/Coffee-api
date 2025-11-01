import { z } from 'zod';

// Coffee Place data schema
export const coffeePlaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  rating: z.number().min(0).max(5),
  openHours: z.object({
    start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  }),
  tags: z.array(z.string()),
});

export type CoffeePlace = z.infer<typeof coffeePlaceSchema>;

// Query parameters schema
export const queryParamsSchema = z.object({
  city: z.string().optional(),
  minRating: z
    .string()
    .optional()
    .transform((val) => (val ? parseFloat(val) : undefined))
    .pipe(z.number().min(0).max(5).optional()),
  openAfter: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  openBefore: z
    .string()
    .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .optional(),
  tags: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(',').map((t) => t.trim()) : undefined))
    .pipe(z.array(z.string()).optional()),
  random: z
    .string()
    .optional()
    .transform((val) => val === 'true')
    .pipe(z.boolean().optional()),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .pipe(z.number().int().min(1).max(100).optional()),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().min(1).optional()),
});

export type QueryParams = z.infer<typeof queryParamsSchema>;

