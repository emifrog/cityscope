'use client';

import type { Building, Plan, PlanRevision, PlanUploadResponse } from '@etare/contracts';
import { PLAN_TYPES, type PlanType } from '@etare/domain';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select, cn } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { PLAN_TYPE_LABELS, REJECTION_REASON_LABELS, SCAN_STATUS_LABELS } from '@/components/labels';
import { BackgroundPicker } from '@/components/plan/background-picker';
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
      {status === 'clean' ? `Révision ${revision.revision_no}` : SCAN_STATUS_LABELS[status]}
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{plan.title}</h3>
          <p className="text-sm text-muted">
            {[PLAN_TYPE_LABELS[plan.plan_type], plan.building_name, plan.level_label].filter(Boolean).join(' · ')}
          </p>
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
          {revision.width} × {revision.height} px · {revision.asset.filename}
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
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="space-y-3">
        {canWrite && !importing ? (
          <Button className="w-full" onClick={() => setImporting(true)}>
            Importer un plan
          </Button>
        ) : null}
        {groups.map((group) => (
          <Card key={group.key}>
            <CardHeader>
              <CardTitle className="text-sm">{group.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1">
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
            </CardContent>
          </Card>
        ))}
        {all.length === 0 && !importing ? (
          <p className="text-sm text-muted">Aucun plan : importez le plan de masse et les plans de niveaux.</p>
        ) : null}
      </aside>
      <section className="min-w-0">
        {importing ? (
          <Card>
            <CardHeader>
              <CardTitle>Importer un plan</CardTitle>
            </CardHeader>
            <CardContent>
              <ImportForm
                siteId={siteId}
                buildings={buildings.data ?? []}
                onDone={(planId) => {
                  setSelectedId(planId);
                  setImporting(false);
                }}
                onCancel={() => setImporting(false)}
              />
            </CardContent>
          </Card>
        ) : current ? (
          <PlanView key={current.id} siteId={siteId} plan={current} canWrite={canWrite} />
        ) : null}
      </section>
    </div>
  );
}
