/**
 * Cartography abstraction (ADR-006). The data provider (IGN / Géoplateforme),
 * the delivery service, the offline package format and the rendering engine
 * (MapLibre) are four independent choices. Screens never hard-code a tile URL:
 * they receive map sources from this catalogue.
 */
export type MapSourceKind = 'raster-wmts' | 'vector-tms' | 'style';

export interface MapSource {
  readonly id: string;
  readonly producer: 'IGN';
  readonly product: string;
  readonly kind: MapSourceKind;
  /** Template or document URL, with {z}/{x}/{y} placeholders when relevant. */
  readonly url: string;
  readonly metadataUrl: string;
  readonly attribution: string;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** Rights must be verified per product before any offline packaging (architecture §13). */
  readonly rights: {
    readonly onlineDisplay: 'open' | 'licensed';
    readonly offlinePackaging: 'unverified' | 'approved' | 'forbidden';
    readonly pdfExport: 'unverified' | 'approved' | 'forbidden';
  };
}

export interface CartographyCatalog {
  sources(): readonly MapSource[];
  defaultBaseMap(): MapSource;
}
