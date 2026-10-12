'use client';

import type { Building, Plan, PlanRevision, PlanUploadResponse } from '@etare/contracts';
import { PLAN_TYPES, type PlanType } from '@etare/domain';
import { Alert, Badge, Button, Card, CardContent, Field, Input, Select, cn } from '@etare/ui';
import { ImagePlus, Map } from 'lucide-react';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PLAN_TYPE_LABELS, REJECTION_REASON_LABELS, SCAN_STATUS_LABELS } from '@/components/labels';
import { BackgroundPicker } from '@/components/plan/background-picker';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import type { UploadStep } from '@/lib/file-upload';
import type { PlanBackground } from '@/lib/plan-image';
import {
  queryKeys,
  useApiMutation,
  useAssetUrl,
  useBuildings,
  useMapCatalog,
  usePermissions,
  useSiteFileUpload,
  useSitePlans,
} from '@/lib/queries';
import { PlanWorkspace } from './plan-workspace';

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

const STEP_LABELS: Readonly<Record<UploadStep, string>> = {
  reading: 'Calcul de l’empreinte du fond…',
  declaring: 'Déclaration du plan…',
  sending: 'Envoi du fond…',
  confirming: 'Demande de contrôle…',
};

/** Title given by default to a level plan: shown only when it says something the list does not. */
const defaultTitle = (plan: Plan) => [plan.building_name, plan.level_label].filter(Boolean).join(' - ');

const currentRevision = (plan: Plan) => plan.revisions.find((revision) => revision.is_current) ?? plan.revisions[0];

function BackgroundStatus({ revision }: { revision: PlanRevision | undefined }) {
  if (!revision) return null;
  const { scan_status: status } = revision.asset;
  return (
    <Badge tone={status === 'clean' ? 'neutral' : status === 'rejected' ? 'critical' : 'info'}>
      {status === 'clean' ? `Rév. ${revision.revision_no}` : SCAN_STATUS_LABELS[status]}
    </Badge>
  );
}

function ImportForm({
  siteId,
  buildings,
  onDone,
  onCancel,
}: {
  siteId: string;
  buildings: readonly Building[];
  onDone: (planId: string) => void;
  onCancel: () => void;
}) {
  const upload = useSiteFileUpload<PlanUploadResponse>(siteId, 'plans');
  const [title, setTitle] = useState('');
  const [planType, setPlanType] = useState<PlanType>('level');
  const [levelId, setLevelId] = useState('');
  const [background, setBackground] = useState<PlanBackground | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const levels = buildings.flatMap((building) =>
    building.levels
      .filter((level) => level.status === 'active')
      .map((level) => ({ ...level, buildingName: building.name })),
  );

  async function submit() {
    setProblem(null);
    const chosenLevel = levels.find((level) => level.id === levelId);
    const finalTitle =
      title.trim() || (chosenLevel ? `${chosenLevel.buildingName} - ${chosenLevel.label}` : PLAN_TYPE_LABELS[planType]);
    if (planType === 'level' && !chosenLevel) return setProblem('Choisissez le niveau du plan.');
    if (!background) return setProblem('Choisissez le fond du plan.');
    try {
      const created = await upload.mutateAsync({
        file: background.file,
        declare: (options, file) =>
          api.createPlan(options, siteId, {
            title: finalTitle,
            plan_type: planType,
            level_id: planType === 'level' ? levelId : null,
            width: background.width,
            height: background.height,
            page_number: background.pageNumber,
            file,
          }),
      });
      onDone(created.plan.id);
    } catch {
      // Shown through upload.error.
    }
  }

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type de plan" htmlFor="plan-type">
          <Select id="plan-type" value={planType} onChange={(event) => setPlanType(event.target.value as PlanType)}>
            {PLAN_TYPES.map((type) => (
              <option key={type} value={type}>
                {PLAN_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        {planType === 'level' ? (
          <Field label="Niveau" htmlFor="plan-level">
            <Select id="plan-level" value={levelId} onChange={(event) => setLevelId(event.target.value)}>
              <option value="">Choisir…</option>
              {buildings.map((building) => (
                <optgroup key={building.id} label={building.name}>
                  {building.levels
                    .filter((level) => level.status === 'active')
                    .map((level) => (
                      <option key={level.id} value={level.id}>
                        {level.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label="Titre" htmlFor="plan-title" hint="Par défaut : bâtiment et niveau." className="sm:col-span-2">
          <Input id="plan-title" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
      </div>
      <BackgroundPicker id="plan-background" onChange={setBackground} />
      {problem ? <Alert tone="critical">{problem}</Alert> : null}
      {upload.step ? <p className="text-sm text-muted">{STEP_LABELS[upload.step]}</p> : null}
      {upload.error ? <ApiErrorAlert error={upload.error} /> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={upload.isPending}>
          {upload.isPending ? 'Import en cours…' : 'Importer le plan'}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={upload.isPending} onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

/** Items placed on a plan: their positions leave the current background when it is replaced. */
const PLAN_ITEMS = ['objects', 'zones', 'risks'] as const;

function ReplaceBackgroundForm({ siteId, plan, onDone }: { siteId: string; plan: Plan; onDone: () => void }) {
  const upload = useSiteFileUpload<PlanUploadResponse>(siteId, 'plans', PLAN_ITEMS);
  const [background, setBackground] = useState<PlanBackground | null>(null);

  async function submit() {
    if (!background) return;
    try {
      await upload.mutateAsync({
        file: background.file,
        declare: (options, file) =>
          api.createPlanRevision(options, plan.id, {
            width: background.width,
            height: background.height,
            page_number: background.pageNumber,
            file,
          }),
      });
      onDone();
    } catch {
      // Shown through upload.error.
    }
  }

  return (
    <div className="space-y-3">
      <Alert tone="info">
        Le fond actuel est conservé dans l’historique. Les objets placés dessus devront être repositionnés et vérifiés
        sur le nouveau fond.
      </Alert>
      <BackgroundPicker id={`replace-${plan.id}`} onChange={setBackground} />
      {upload.step ? <p className="text-sm text-muted">{STEP_LABELS[upload.step]}</p> : null}
      {upload.error ? <ApiErrorAlert error={upload.error} /> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={!background || upload.isPending} onClick={() => void submit()}>
          {upload.isPending ? 'Envoi…' : 'Remplacer le fond'}
        </Button>
        <Button size="sm" variant="secondary" disabled={upload.isPending} onClick={onDone}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

function PlanView({ siteId, plan, canWrite }: { siteId: string; plan: Plan; canWrite: boolean }) {
  const catalog = useMapCatalog();
  const [revisionId, setRevisionId] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const revision = plan.revisions.find((candidate) => candidate.id === revisionId) ?? currentRevision(plan);
  const clean = revision?.asset.scan_status === 'clean';
  const image = useAssetUrl(clean ? (revision?.asset.id ?? null) : null);
  const archive = useApiMutation(
    (options, status: 'active' | 'archived') => api.updatePlan(options, plan.id, plan.row_version, { status }),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'plans')],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-navy text-white"
          >
            <Map className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-foreground">
              {plan.title}
              {plan.status === 'archived' ? <Badge>Archivé</Badge> : null}
            </h3>
            <p className="text-sm text-muted">
              {[PLAN_TYPE_LABELS[plan.plan_type], plan.building_name, plan.level_label].filter(Boolean).join(' · ')}
              {revision ? ` · ${revision.width} × ${revision.height} px` : ''}
            </p>
          </div>
        </div>
        {canWrite && !replacing ? (
          <div className="flex flex-wrap gap-2">
            {plan.status === 'active' ? (
              <Button size="sm" variant="secondary" onClick={() => setReplacing(true)}>
                Remplacer le fond
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={archive.isPending}
              onClick={() => archive.mutate(plan.status === 'active' ? 'archived' : 'active')}
            >
              {plan.status === 'active' ? 'Archiver' : 'Réactiver'}
            </Button>
          </div>
        ) : null}
      </div>
      {archive.error ? <ApiErrorAlert error={archive.error} /> : null}
      {replacing ? (
        <Card>
          <CardContent className="pt-5">
            <ReplaceBackgroundForm siteId={siteId} plan={plan} onDone={() => setReplacing(false)} />
          </CardContent>
        </Card>
      ) : null}
      {plan.revisions.length > 1 ? (
        <Field label="Révision du fond" htmlFor={`revision-${plan.id}`} className="max-w-sm">
          <Select
            id={`revision-${plan.id}`}
            value={revision?.id ?? ''}
            onChange={(event) => setRevisionId(event.target.value)}
          >
            {plan.revisions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                Révision {candidate.revision_no} · {dateFormat.format(new Date(candidate.created_at))}
                {candidate.is_current ? ' (actuelle)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {revision && revision.asset.scan_status === 'pending' ? (
        <Alert tone="info">Le fond est en cours de contrôle : il s’affichera dès qu’il sera vérifié.</Alert>
      ) : null}
      {revision && revision.asset.scan_status === 'rejected' ? (
        <Alert tone="critical">
          Fond refusé :{' '}
          {REJECTION_REASON_LABELS[revision.asset.rejection_reason ?? ''] ?? 'il ne respecte pas les règles de dépôt'}.
          Remplacez-le.
        </Alert>
      ) : null}
      {image.error ? <ApiErrorAlert error={image.error} /> : null}
      {clean && revision && image.data && catalog.data ? (
        <PlanWorkspace
          key={revision.id}
          siteId={siteId}
          plan={plan}
          revision={revision}
          catalog={catalog.data}
          imageUrl={image.data.url}
          canWrite={canWrite}
        />
      ) : clean ? (
        <LoadingCard lines={6} />
      ) : null}
      {revision ? (
        <p className="text-xs text-muted">
          {revision.asset.filename}
          {revision.page_number > 1 ? ` · page ${revision.page_number} du PDF source` : ''}
        </p>
      ) : null}
    </div>
  );
}

export function PlansPanel({ siteId }: { siteId: string }) {
  const canWrite = usePermissions().has('site:write');
  const plans = useSitePlans(siteId);
  const buildings = useBuildings(siteId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  if (plans.isPending || buildings.isPending) return <LoadingCard lines={4} />;
  if (plans.error) return <ApiErrorAlert error={plans.error} />;

  const all = plans.data;
  const active = all.filter((plan) => plan.status === 'active').length;
  const current = all.find((plan) => plan.id === selectedId) ?? all.find((plan) => plan.status === 'active') ?? all[0];
  const selected = importing ? undefined : current;
  const groups = [
    { key: 'general', title: 'Plans du site', items: all.filter((plan) => !plan.building_id) },
    ...(buildings.data ?? []).map((building) => ({
      key: building.id,
      title: building.name,
      items: all.filter((plan) => plan.building_id === building.id),
    })),
  ].filter((group) => group.items.length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <aside className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Badge tone="info" className="px-3 py-1 text-sm">
            {active} plan{active > 1 ? 's' : ''}
          </Badge>
          {canWrite && !importing ? (
            <Button size="sm" onClick={() => setImporting(true)}>
              <ImagePlus aria-hidden="true" className="size-4" />
              Importer
            </Button>
          ) : null}
        </div>
        {groups.length > 0 ? (
          <Card>
            <nav aria-label="Plans du site" className="divide-y divide-border">
              {groups.map((group) => (
                <div key={group.key} className="px-2 py-2">
                  <p className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">{group.title}</p>
                  <ul className="space-y-0.5">
                    {group.items.map((plan) => (
                      <li key={plan.id}>
                        <button
                          type="button"
                          aria-current={selected?.id === plan.id ? 'true' : undefined}
                          onClick={() => {
                            setSelectedId(plan.id);
                            setImporting(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                            selected?.id === plan.id ? 'bg-info-soft font-semibold text-info' : 'hover:bg-subtle',
                            plan.status === 'archived' ? 'opacity-60' : undefined,
                          )}
                        >
                          <span className="min-w-0">
                            {plan.level_label ?? plan.title}
                            {plan.level_label && plan.title !== defaultTitle(plan) ? (
                              <span className="block truncate text-xs font-normal text-muted">{plan.title}</span>
                            ) : null}
                            {plan.status === 'archived' ? (
                              <span className="block text-xs font-normal text-muted">Archivé</span>
                            ) : null}
                          </span>
                          <BackgroundStatus revision={currentRevision(plan)} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </Card>
        ) : null}
      </aside>
      <section className="min-w-0">
        {importing ? (
          <SectionCard
            icon={ImagePlus}
            title="Importer un plan"
            description="Plan de masse, de niveau, de réseaux ou d’évacuation : le fond est contrôlé avant d’être affiché."
          >
            <ImportForm
              siteId={siteId}
              buildings={buildings.data ?? []}
              onDone={(planId) => {
                setSelectedId(planId);
                setImporting(false);
              }}
              onCancel={() => setImporting(false)}
            />
          </SectionCard>
        ) : current ? (
          <PlanView key={current.id} siteId={siteId} plan={current} canWrite={canWrite} />
        ) : (
          <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
            <span
              aria-hidden="true"
              className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
            >
              <Map className="size-6" />
            </span>
            <p className="font-semibold text-foreground">Aucun plan pour ce site.</p>
            <p className="text-sm text-muted">
              Importez le plan de masse puis les plans de niveaux : les points opérationnels s’y placent ensuite.
            </p>
          </Card>
        )}
      </section>
    </div>
  );
}
