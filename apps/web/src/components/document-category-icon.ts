import type { DocumentCategory } from '@etare/domain';
import { FileText, FlaskConical, Image, Map, type LucideIcon } from 'lucide-react';

/** A pictogram per category of document, wherever a document is listed. */
export const DOCUMENT_CATEGORY_ICONS: Readonly<Record<DocumentCategory, LucideIcon>> = {
  fds: FlaskConical,
  notice: FileText,
  instruction: FileText,
  plan: Map,
  photo: Image,
  other: FileText,
};
