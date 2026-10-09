'use client';

import type { SiteDetail } from '@etare/contracts';
import { Alert, Button, Field, Input, cn } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Building2, CalendarCheck, CalendarClock, FileCheck2, Link2, QrCode } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { AddressSearch } from '@/components/address-search';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { isStaleVersion } from '@/components/form-helpers';
import { SENSITIVITY_LABELS, SITE_STATUS_LABELS, SITE_TYPE_LABELS } from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { SiteQrCode } from '@/components/site-qr-code';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useExternalIds, usePermissions } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { verificationState } from '@/lib/site-verification';
import { useTenant } from '@/providers/tenant-provider';
import { SiteForm } from '../site-form';

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

/** When the site was last checked on the field, and whether that is recent enough. */
function VerificationStrip({
  site,
  now,
  canWrite,
  pending,
  onVerify,
}: {
  site: SiteDetail;
  now: number;
  canWrite: boolean;
  pending: boolean;
  onVerify: () => void;
}) {
  const state = verificationState(site.last_verified_at, now);
  const ok = state === 'verified';
  const Icon = ok ? CalendarCheck : CalendarClock;
  const text =
    state === 'never'
      ? 'Jamais vérifié sur le terrain.'
      : `${ok ? 'Vérifié sur le terrain' : 'À vérifier : dernière vérification'} ${agoLabel(site.last_verified_at ?? '', now)}`;
  return (
    <div
      className={cn(
        'mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md px-3 py-2 text-sm',
        ok ? 'bg-success-soft text-success' : 'bg-important-soft text-important',
      )}
    >
      <p className="flex items-center gap-2">
        <Icon aria-hidden="true" className="size-4 shrink-0" />
        <span>
          {text}
          {site.last_verified_at ? (
            <span className="opacity-80"> ({dateFormat.format(new Date(site.last_verified_at))})</span>
          ) : null}
        </span>
      </p>
      {canWrite ? (
        <Button variant="secondary" size="sm" disabled={pending} onClick={onVerify}>
          Marquer comme vérifié
        </Button>
      ) : null}
    </div>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function SummaryPanel({ site }: { site: SiteDetail }) {
  const permissions = usePermissions();
  const [editing, setEditing] = useState(false);
  const { activeTenant } = useTenant();
  const queryClient = useQueryClient();
  const update = useApiMutation(
    (options, patch: Parameters<typeof api.updateSite>[3]) => api.updateSite(options, site.id, site.row_version, patch),
    (tenantId) => [queryKeys.site(tenantId, site.id), queryKeys.sites(tenantId)],
  );

  // Separate from the edit form: its errors must not show up in the form.
  const verify = useApiMutation(
    (options, _: void) => api.updateSite(options, site.id, site.row_version, { verified: true }),
    (tenantId) => [queryKeys.site(tenantId, site.id), queryKeys.sites(tenantId)],
  );

  const reload = async () => {
    update.reset();
    await queryClient.invalidateQueries({ queryKey: queryKeys.site(activeTenant?.tenant_id ?? 'none', site.id) });
  };
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const canWrite = permissions.has('site:write');

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <SectionCard
        icon={Building2}
        title="Référentiel site"
        description="Données de travail : chaque modification est tracée et validée avant diffusion."
        aside={
          canWrite && !editing ? (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Modifier
            </Button>
          ) : null
        }
      >
        <>
          {editing ? (
            <>
              {isStaleVersion(update.error) ? (
                <Alert tone="important" className="mb-4">
                  <p>{update.error instanceof Error ? update.error.message : ''}</p>
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => void reload()}>
                    Recharger la dernière version
                  </Button>
                </Alert>
              ) : null}
              <SiteForm
                key={site.row_version}
                mode="edit"
                addressSearch={(apply) => <AddressSearch id="address-search" onSelect={apply} />}
                initial={site}
                submitting={update.isPending}
                error={isStaleVersion(update.error) ? null : update.error}
                onSubmit={async (payload) => {
                  await update.mutateAsync(payload);
                  setEditing(false);
                }}
                onCancel={() => {
                  update.reset();
                  setEditing(false);
                }}
              />
            </>
          ) : (
            <>
              <VerificationStrip
                site={site}
                now={now}
                canWrite={canWrite}
                pending={verify.isPending}
                onVerify={() => verify.mutate()}
              />
              {verify.error ? (
                <div className="mb-4">
                  <ApiErrorAlert error={verify.error} />
                </div>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
                <Item label="N° ETARE">{site.etare_number ?? '—'}</Item>
                <Item label="Type">{SITE_TYPE_LABELS[site.site_type]}</Item>
                <Item label="Statut">{SITE_STATUS_LABELS[site.status]}</Item>
                <Item label="Sensibilité">{SENSITIVITY_LABELS[site.sensitivity]}</Item>
                <Item label="Bâtiments">{site.building_count}</Item>
                <Item label="Point de référence">
                  {site.location ? `${site.location.coordinates[1]}, ${site.location.coordinates[0]}` : '—'}
                </Item>
                <Item label="Commune">
                  {site.address
                    ? `${site.address.city}${site.address.postal_code ? ` (${site.address.postal_code})` : ''}`
                    : '—'}
                </Item>
                <Item label="Code INSEE">{site.address?.insee_code ?? '—'}</Item>
                <Item label="Dernière modification">
                  {agoLabel(site.updated_at, now)}
                  <span className="block text-xs text-muted">{dateFormat.format(new Date(site.updated_at))}</span>
                </Item>
              </dl>
              {site.sensitivity !== 'normal' ? (
                <p className="mt-4 text-xs text-muted">
                  Site sensible : ses consultations, exports et ouvertures sur tablette sont tracés (journal de
                  l’administration).{' '}
                  {site.sensitivity === 'restricted'
                    ? 'Sur tablette, il s’ouvre à la demande, pour les seules personnes habilitées.'
                    : 'Il n’est jamais diffusé sur les tablettes.'}
                </p>
              ) : null}
            </>
          )}
        </>
      </SectionCard>

      <div className="space-y-4">
        <SectionCard
          icon={FileCheck2}
          title="Publication"
          description="Ce que les intervenants consultent."
          contentClassName="space-y-3 px-5 py-4 text-sm"
        >
          {site.active_publication ? (
            <p>
              <span className="font-semibold text-foreground">
                Version n° {site.active_publication.publication_number}
              </span>{' '}
              publiée {agoLabel(site.active_publication.published_at, now)}, le{' '}
              {dateFormat.format(new Date(site.active_publication.published_at))}. Elle ne sera jamais modifiée : une
              nouvelle version la remplacera.
            </p>
          ) : (
            <p className="text-muted">
              Ce site n’a pas encore de version publiée : les tablettes ne le connaissent pas.
            </p>
          )}
          <Link
            href={`/sites/${site.id}?onglet=etare`}
            scroll={false}
            className="inline-block text-sm font-medium text-info hover:underline"
          >
            Dossier ETARE, révisions et publications
          </Link>
        </SectionCard>
        <SectionCard icon={QrCode} title="Code QR du site" contentClassName="space-y-3 px-5 py-4 text-sm">
          <SiteQrCode siteId={site.id} />
          <p className="text-xs text-muted">
            Imprimé sur la première page du dossier ETARE. Scanné par l’application OPS, il ouvre la version installée
            sur la tablette ; il ne contient ni secret ni droit d’accès.
          </p>
        </SectionCard>
        <ExternalIdsCard siteId={site.id} canWrite={canWrite} />
      </div>
    </div>
  );
}

const externalIdFormSchema = z.object({
  system_code: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,31}$/, 'Code système en majuscules (SIG, SGO, DECI…).'),
  external_id: z.string().trim().min(1, 'Identifiant requis.').max(200),
});

function ExternalIdsCard({ siteId, canWrite }: { siteId: string; canWrite: boolean }) {
  const ids = useExternalIds(siteId);
  const create = useApiMutation(
    (options, values: z.infer<typeof externalIdFormSchema>) =>
      api.createExternalId(options, siteId, { entity_type: 'site', entity_id: siteId, ...values }),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'external-ids')],
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof externalIdFormSchema>>({
    resolver: zodResolver(externalIdFormSchema),
    defaultValues: { system_code: '', external_id: '' },
  });

  return (
    <SectionCard
      icon={Link2}
      title="Identifiants externes"
      description="Le même site dans le SIG, le SGO ou la DECI."
      contentClassName="space-y-4 px-5 py-4"
    >
      <>
        {ids.isPending ? <LoadingCard lines={1} /> : null}
        {ids.error ? <ApiErrorAlert error={ids.error} /> : null}
        {ids.data?.length === 0 ? <p className="text-sm text-muted">Aucun identifiant externe.</p> : null}
        <ul className="space-y-1 text-sm">
          {ids.data?.map((id) => (
            <li key={id.id}>
              <span className="font-semibold">{id.system_code}</span> · {id.external_id}
              {id.entity_type !== 'site' ? <span className="text-muted"> ({id.entity_type})</span> : null}
            </li>
          ))}
        </ul>
        {canWrite ? (
          <form
            noValidate
            className="grid grid-cols-2 gap-2"
            onSubmit={handleSubmit(async (values) => {
              await create.mutateAsync(values);
              reset();
            })}
          >
            {create.error ? (
              <div className="col-span-2">
                <ApiErrorAlert error={create.error} />
              </div>
            ) : null}
            <Field label="Système" htmlFor="ext-system" error={errors.system_code?.message}>
              <Input id="ext-system" placeholder="SIG" {...register('system_code')} />
            </Field>
            <Field label="Identifiant" htmlFor="ext-id" error={errors.external_id?.message}>
              <Input id="ext-id" {...register('external_id')} />
            </Field>
            <Button type="submit" size="sm" variant="secondary" className="col-span-2" disabled={create.isPending}>
              Associer
            </Button>
          </form>
        ) : null}
      </>
    </SectionCard>
  );
}
