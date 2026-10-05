'use client';

import type { EtareSnapshot } from '@etare/contracts';
import {
  OPTIONAL_SECTIONS,
  SECTION_TITLES,
  compareObjects,
  compareRisks,
  objectTitle,
  photoAnnex,
  propertyDefinitions,
  sectionObjects,
  visibleSections,
  type LayoutSection,
  type PhotoAnnex,
} from '@etare/domain';
import { Badge, cn } from '@etare/ui';
import type { ReactNode } from 'react';
import {
  CLASSIFICATION_TYPE_LABELS,
  CRITICALITY_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  OBJECT_STATUS_LABELS,
  PLAN_TYPE_LABELS,
  SITE_TYPE_LABELS,
  ZONE_TYPE_LABELS,
} from '@/components/labels';
import { RiskPictogram } from '@/components/plan/risk-pictograms';
import { useAssetUrl } from '@/lib/queries';

type SnapshotObject = EtareSnapshot['objects'][number];
type SnapshotPhoto = NonNullable<SnapshotObject['photos']>[number];
type SnapshotRisk = EtareSnapshot['risks'][number];

function formatValue(
  value: unknown,
  unit: string | undefined,
  choices?: readonly { const: unknown; title?: string }[],
) {
  if (typeof value === 'boolean') return value ? 'oui' : 'non';
  const shown = choices?.find((choice) => choice.const === value)?.title ?? String(value);
  return unit ? `${shown} ${unit}` : shown;
}

function Properties({ schema, values }: { schema: unknown; values: Readonly<Record<string, unknown>> }) {
  const rows = Object.entries(propertyDefinitions(schema)).flatMap(([name, definition]) => {
    const value = values[name];
    return value === undefined || value === null || value === ''
      ? []
      : [[definition.title ?? name, formatValue(value, definition.unit, definition.oneOf)] as const];
  });
  if (rows.length === 0) return null;
  return <p className="text-xs text-muted">{rows.map(([label, value]) => `${label} : ${value}`).join(' · ')}</p>;
}

function Section({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-border pt-4">
      <h3 className="mb-2 text-sm font-bold tracking-wide text-brand-navy uppercase">
        {number}. {title}
      </h3>
      {children}
    </section>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted">{children}</p>;

/** A photo of the annex: the reduced image of the back-office (the PDF reduces the original itself). */
function AnnexPhoto({ photo, object, section }: { photo: SnapshotPhoto; object: SnapshotObject; section: string }) {
  const image = useAssetUrl(photo.asset.id, 'thumbnail');
  return (
    <li className="space-y-1">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-subtle">
        {image.data ? (
          // Short-lived signed URL of a checked file: next/image cannot optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.data.url} alt={photo.caption ?? photo.asset.filename} className="size-full object-contain" />
        ) : (
          <span className="text-xs text-muted">{image.isError ? 'Image indisponible' : 'Chargement…'}</span>
        )}
      </div>
      <p className="text-xs font-semibold">{photo.caption ?? 'Sans légende'}</p>
      <p className="text-xs">
        {objectTitle(object)} <span className="text-muted">— {object.type_name}</span>
      </p>
      <p className="text-xs text-muted">{section}</p>
    </li>
  );
}

function PhotoAnnexList({ annex }: { annex: PhotoAnnex<SnapshotObject, SnapshotPhoto> }) {
  return (
    <>
      {annex.entries.length === 0 ? <Empty>Aucune photo dans les sections affichées.</Empty> : null}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {annex.entries.map((entry) => (
          <AnnexPhoto
            key={entry.photo.id}
            photo={entry.photo}
            object={entry.object}
            section={SECTION_TITLES[entry.section]}
          />
        ))}
      </ul>
      {annex.omitted > 0 ? (
        <p className="mt-2 text-xs text-muted">
          {annex.omitted > 1
            ? `${annex.omitted} autres photos sont consultables sur la tablette, avec les fiches des points.`
            : '1 autre photo est consultable sur la tablette, avec la fiche de son point.'}
        </p>
      ) : null}
    </>
  );
}

/**
 * Faithful preview of an ETARE, rendered from a canonical snapshot only:
 * what the validator approves is exactly what is shown (ETARE-01). Same
 * sections, order, numbering and photo annex as the PDF (ADR-026).
 */
export function EtareDocument({ snapshot, versionLabel }: { snapshot: EtareSnapshot; versionLabel: string }) {
  const { site } = snapshot;
  const buildings = new Map(snapshot.buildings.map((building) => [building.id, building]));
  const levels = new Map(
    snapshot.buildings.flatMap((building) => building.levels.map((level) => [level.id, level] as const)),
  );
  const zones = new Map(snapshot.zones.map((zone) => [zone.id, zone]));
  const objectTypes = new Map(snapshot.catalog.object_types.map((type) => [type.code, type]));
  const riskTypes = new Map(snapshot.catalog.risk_types.map((type) => [type.code, type]));
  const sections = visibleSections(snapshot.layout);

  const scope = (item: { building_id: string | null; level_id: string | null; zone_id: string | null }) =>
    [
      item.building_id ? buildings.get(item.building_id)?.name : null,
      item.level_id ? levels.get(item.level_id)?.label : null,
      item.zone_id ? zones.get(item.zone_id)?.name : null,
    ]
      .filter(Boolean)
      .join(' · ') || 'Site';

  const critical = [
    ...snapshot.risks
      .filter((risk) => risk.severity >= 4)
      .sort(compareRisks)
      .map((risk) => [risk.type_name, risk.label].filter(Boolean).join(' ')),
    ...snapshot.objects
      .filter((object) => object.criticality === 'critical')
      .sort(compareObjects)
      .map(objectTitle),
  ];

  const objectItem = (object: SnapshotObject) => (
    <li key={object.id} className="py-1.5">
      <p className="text-sm">
        <span className={cn(object.criticality === 'critical' && 'font-semibold')}>{objectTitle(object)}</span>{' '}
        <span className="text-muted">— {object.type_name}</span>{' '}
        {object.criticality !== 'info' ? (
          <Badge tone={object.criticality === 'critical' ? 'critical' : 'important'}>
            {CRITICALITY_LABELS[object.criticality]}
          </Badge>
        ) : null}{' '}
        {object.status !== 'active' ? <Badge tone="critical">{OBJECT_STATUS_LABELS[object.status]}</Badge> : null}
      </p>
      <p className="text-xs text-muted">
        {scope(object)}
        {object.plan_position ? ' · sur plan' : object.geometry ? ' · sur carte' : ''}
      </p>
      <Properties schema={objectTypes.get(object.type_code)?.properties_schema} values={object.properties} />
      {object.instructions ? <p className="text-sm whitespace-pre-line">{object.instructions}</p> : null}
    </li>
  );

  const riskItem = (risk: SnapshotRisk) => (
    <li key={risk.id} className="flex gap-3 py-1.5">
      <RiskPictogram iconKey={risk.icon_key} />
      <div>
        <p className="text-sm">
          <span className="font-semibold">{risk.type_name}</span>
          {risk.label ? ` — ${risk.label}` : ''}{' '}
          <Badge tone={risk.severity >= 4 ? 'critical' : 'important'}>Gravité {risk.severity}</Badge>
        </p>
        <p className="text-xs text-muted">
          {scope(risk)}
          {risk.quantity !== null ? ` · ${risk.quantity} ${risk.unit ?? ''}` : ''}
          {risk.plan_position ? ' · sur plan' : ''}
          {risk.geometry ? ' · sur carte' : ''}
        </p>
        <Properties schema={riskTypes.get(risk.type_code)?.properties_schema} values={risk.properties} />
        {risk.description ? <p className="text-sm whitespace-pre-line">{risk.description}</p> : null}
      </div>
    </li>
  );

  const content = (section: LayoutSection): ReactNode | null => {
    switch (section) {
      case 'synthesis':
        return (
          <>
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-muted">Type : </dt>
                <dd className="inline">{SITE_TYPE_LABELS[site.site_type]}</dd>
              </div>
              {snapshot.classifications.map((classification) => (
                <div key={classification.id}>
                  <dt className="inline text-muted">
                    {CLASSIFICATION_TYPE_LABELS[classification.classification_type]} :{' '}
                  </dt>
                  <dd className="inline">
                    {[
                      classification.code,
                      classification.category && `${classification.category}e cat.`,
                      classification.label,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 rounded-md bg-critical-soft px-3 py-2">
              <p className="text-xs font-bold text-critical uppercase">Points critiques</p>
              <p className="text-sm">{critical.length > 0 ? critical.join(' • ') : 'Aucun point critique déclaré.'}</p>
            </div>
          </>
        );
      case 'risks': {
        const risks = [...snapshot.risks].sort(compareRisks);
        const riskObjects = sectionObjects(snapshot.objects, 'risks');
        return risks.length === 0 && riskObjects.length === 0 ? (
          <Empty>Aucun risque déclaré.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {risks.map(riskItem)}
            {riskObjects.map(objectItem)}
          </ul>
        );
      }
      case 'access':
      case 'water':
      case 'energy':
      case 'rescue': {
        const items = sectionObjects(snapshot.objects, section);
        return items.length === 0 ? (
          <Empty>Rien de déclaré.</Empty>
        ) : (
          <ul className="divide-y divide-border">{items.map(objectItem)}</ul>
        );
      }
      case 'plans':
        return (
          <>
            {snapshot.buildings.length === 0 ? <Empty>Aucun bâtiment.</Empty> : null}
            <ul className="space-y-1 text-sm">
              {snapshot.buildings.map((building) => (
                <li key={building.id}>
                  <span className="font-medium">{building.name}</span>
                  {building.levels.length > 0 ? (
                    <span className="text-muted">
                      {' '}
                      — niveaux : {building.levels.map((level) => level.label).join(', ')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {snapshot.plans.length > 0 ? (
              <ul className="mt-2 space-y-1 text-sm">
                {snapshot.plans.map((plan) => {
                  const onPlan = [...snapshot.zones, ...snapshot.objects, ...snapshot.risks].filter(
                    (item) => item.plan_position?.plan_revision_id === plan.background.revision_id,
                  ).length;
                  return (
                    <li key={plan.id}>
                      {plan.title}{' '}
                      <span className="text-muted">
                        ({PLAN_TYPE_LABELS[plan.plan_type]}, fond n° {plan.background.revision_no}, {onPlan} élément
                        {onPlan > 1 ? 's' : ''})
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>Aucun plan publié.</Empty>
            )}
            {snapshot.zones.length > 0 ? (
              <p className="mt-2 text-xs text-muted">
                Zones : {snapshot.zones.map((zone) => `${zone.name} (${ZONE_TYPE_LABELS[zone.zone_type]})`).join(', ')}
              </p>
            ) : null}
          </>
        );
      case 'contacts':
        return snapshot.contacts.length === 0 ? (
          <Empty>Aucun contact destiné aux intervenants.</Empty>
        ) : (
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            {snapshot.contacts.map((contact) => (
              <li key={contact.id}>
                <span className="font-medium">{contact.name}</span>
                {contact.role ? <span className="text-muted"> — {contact.role}</span> : null}
                <br />
                {contact.phone}
                {contact.phone_alt ? ` · ${contact.phone_alt}` : ''}
                {contact.availability ? <span className="text-muted"> · {contact.availability}</span> : null}
              </li>
            ))}
          </ul>
        );
      case 'annexes':
        return snapshot.documents.length === 0 ? (
          <Empty>Aucun document.</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {snapshot.documents.map((document) => (
              <li key={document.id}>
                {document.title}{' '}
                <span className="text-muted">
                  ({DOCUMENT_CATEGORY_LABELS[document.category]}, version {document.version.version_no})
                </span>
              </li>
            ))}
          </ul>
        );
      case 'photos': {
        // As in the PDF: no annex for a content without any photo.
        const annex = photoAnnex(snapshot.objects, sections);
        return annex && (annex.entries.length > 0 || annex.omitted > 0) ? <PhotoAnnexList annex={annex} /> : null;
      }
    }
  };

  // Numbered like the PDF: only the sections drawn count.
  const shown = sections
    .map((section) => ({ section, body: content(section) }))
    .filter((entry) => entry.body !== null)
    .map((entry, index) => ({ ...entry, number: index + 1 }));

  return (
    <article
      className="space-y-4 rounded-card border border-border bg-surface p-5"
      aria-label="Aperçu du document ETARE"
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-brand-accent-strong uppercase">
            ETARE {site.etare_number ?? 'sans numéro'}
          </p>
          <h2 className="text-xl font-bold">{site.name}</h2>
          <p className="text-sm text-muted">{site.address?.label ?? 'Adresse non renseignée'}</p>
        </div>
        <Badge tone="neutral">{versionLabel}</Badge>
      </header>
      {shown.map(({ section, body, number: index }) => (
        <Section key={section} number={index} title={SECTION_TITLES[section]}>
          {body}
        </Section>
      ))}
      {snapshot.layout ? (
        <p className="text-xs text-muted">
          Sections masquées par le SIS :{' '}
          {OPTIONAL_SECTIONS.filter((section) => !sections.includes(section))
            .map((section) => SECTION_TITLES[section])
            .join(', ')}
          .
        </p>
      ) : null}
    </article>
  );
}
