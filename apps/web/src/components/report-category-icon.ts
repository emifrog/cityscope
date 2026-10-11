import type { ReportCategory } from '@etare/domain';
import { CircleHelp, DoorOpen, Droplets, Map, Phone, TriangleAlert, type LucideIcon } from 'lucide-react';

/** A pictogram per category of field report, wherever a report is listed or opened. */
export const REPORT_CATEGORY_ICONS: Readonly<Record<ReportCategory, LucideIcon>> = {
  access: DoorOpen,
  water: Droplets,
  risk: TriangleAlert,
  contact: Phone,
  plan: Map,
  other: CircleHelp,
};
