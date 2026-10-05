import { uuidSchema } from '@etare/schemas';
import { z } from 'zod';

/**
 * Sectors of a SIS (PER-01, ADR-025): named groups of sites, by commune (the
 * sites of its communes, future ones included) and site by site. They are the
 * perimeter of terminals and of members limited to part of the SIS.
 */
const inseeCodeSchema = z.string().regex(/^[0-9][0-9AB][0-9]{3}$/, 'Code INSEE invalide (5 caractères).');

export const sectorCommuneSchema = z
  .object({ insee_code: inseeCodeSchema, label: z.string().trim().min(1).max(120) })
  .meta({ id: 'SectorCommune' });
export type SectorCommune = z.infer<typeof sectorCommuneSchema>;

export const namedRefSchema = z.object({ id: uuidSchema, name: z.string() }).meta({ id: 'NamedRef' });
export type NamedRef = z.infer<typeof namedRefSchema>;

export const sectorSchema = z
  .object({
    id: uuidSchema,
    name: z.string(),
    code: z.string().nullable(),
    description: z.string().nullable(),
    communes: z.array(sectorCommuneSchema),
    /** Sites added one by one (outside its communes, or without INSEE code). */
    sites: z.array(namedRefSchema),
    /** Sites covered (communes and sites added), archived sites excepted. */
    site_count: z.number().int().nonnegative(),
    member_count: z.number().int().nonnegative(),
    device_count: z.number().int().nonnegative(),
    row_version: z.number().int().positive(),
  })
  .meta({ id: 'Sector' });
export type Sector = z.infer<typeof sectorSchema>;

export const sectorListSchema = z
  .object({
    items: z.array(sectorSchema),
    /** Sites (not archived) in no sector: terminals and members limited to sectors never get them. */
    sites_outside_sectors: z.number().int().nonnegative(),
  })
  .meta({ id: 'SectorList' });
export type SectorList = z.infer<typeof sectorListSchema>;

export const sectorSaveSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom du secteur obligatoire.').max(120),
    code: z.string().trim().max(30).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional(),
    communes: z.array(sectorCommuneSchema).max(500),
    site_ids: z.array(uuidSchema).max(2000),
  })
  .meta({ id: 'SectorSave' });
export type SectorSave = z.infer<typeof sectorSaveSchema>;

/** Communes of the sites of the SIS, to compose sectors. */
export const sectorCommuneListSchema = z
  .object({
    items: z.array(sectorCommuneSchema.extend({ site_count: z.number().int().nonnegative() })),
  })
  .meta({ id: 'SectorCommuneList' });
export type SectorCommuneList = z.infer<typeof sectorCommuneListSchema>;

/** Perimeter of a terminal: no sector means the whole SIS, explicitly (maquette, screen 11). */
export const devicePerimeterSchema = z
  .object({ sector_ids: z.array(uuidSchema).max(50) })
  .meta({ id: 'DevicePerimeter' });
export type DevicePerimeterInput = z.infer<typeof devicePerimeterSchema>;

/** Perimeter of a member: sectors and sites; both empty means the whole SIS. */
export const memberPerimeterSchema = z
  .object({ sector_ids: z.array(uuidSchema).max(50), site_ids: z.array(uuidSchema).max(150) })
  .meta({ id: 'MemberPerimeter' });
export type MemberPerimeterInput = z.infer<typeof memberPerimeterSchema>;
