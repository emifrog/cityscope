import { SENSITIVITY_LEVELS, SITE_STATUSES, SITE_TYPES } from '@etare/domain';
import { z } from 'zod';

export const siteStatusSchema = z.enum(SITE_STATUSES);
export const siteTypeSchema = z.enum(SITE_TYPES);
export const sensitivitySchema = z.enum(SENSITIVITY_LEVELS);

export const siteNameSchema = z.string().trim().min(1).max(200);
export const etareNumberSchema = z.string().trim().min(1).max(40);
