'use client';

import type { SiteDetail } from '@etare/contracts';
import { Alert, Button, Card, CardContent, CardHeader, CardTitle, Field, Input } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { isStaleVersion } from '@/components/form-helpers';
import { SENSITIVITY_LABELS, SITE_STATUS_LABELS, SITE_TYPE_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useExternalIds, usePermissions } from '@/lib/queries';
import { useTenant } from '@/providers/tenant-provider';
import { SiteForm } from '../site-form';

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
});

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

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Référentiel site</CardTitle>
          {permissions.has('site:write') && !editing ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" disabled={verify.isPending} onClick={() => verify.mutate()}>
                Marquer comme vérifié
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Modifier
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent>
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
              {verify.error ? (
                <div className="mb-4">
                  <ApiErrorAlert error={verify.error} />
                </div>
              ) : null}
              <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">
                <Item label="N° ETARE">{site.etare_number ?? '—'}</Item>
                <Item label="Type">{SITE_TYPE_LABELS[site.site_type]}</Item>
                <Item label="Statut">{SITE_STATUS_LABELS[site.status]}</Item>
                <Item label="Sensibilité">{SENSITIVITY_LABELS[site.sensitivity]}</Item>
                <Item label="Bâtiments">{site.building_count}</Item>
                <Item label="Point de référence">
                  {site.location ? `${site.location.coordinates[1]}, ${site.location.coordinates[0]}` : '—'}
                </Item>
                <Item label="Dernière vérification">
                  {site.last_verified_at ? dateFormat.format(new Date(site.last_verified_at)) : '—'}
                </Item>
                <Item label="Dernière modification">{dateFormat.format(new Date(site.updated_at))}</Item>
              </dl>
            </>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Publication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {site.active_publication ? (
              <p>
                Version n° {site.active_publication.publication_number} publiée le{' '}
                {dateFormat.format(new Date(site.active_publication.published_at))}. C’est la seule version consultée
                par les intervenants ; elle ne sera jamais modifiée.
              </p>
            ) : (
              <p className="text-muted">Ce site n’a pas encore de version publiée.</p>
            )}
            <p className="text-xs text-muted">
              Vous consultez les données de travail. Chaque modification est tracée et devra être validée avant d’être
              diffusée.
            </p>
          </CardContent>
        </Card>
        <ExternalIdsCard siteId={site.id} canWrite={permissions.has('site:write')} />
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
    <Card>
      <CardHeader>
        <CardTitle>Identifiants externes</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
      </CardContent>
    </Card>
  );
}
