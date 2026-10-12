'use client';

import type { Classification, ClassificationCreate } from '@etare/contracts';
import { CLASSIFICATION_TYPES } from '@etare/domain';
import { Badge, Button, Card, Field, Input, Select, cn } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, ScrollText, Stamp } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { blankToNull } from '@/components/form-helpers';
import { CLASSIFICATION_TYPE_LABELS } from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useClassifications, usePermissions } from '@/lib/queries';

const today = () => new Date().toISOString().slice(0, 10);
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'UTC' });
const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(`${value}T00:00:00Z`)) : null);

export function isCurrent(classification: Classification, on = today()): boolean {
  return (
    (!classification.valid_from || classification.valid_from <= on) &&
    (!classification.valid_to || classification.valid_to >= on)
  );
}

const formSchema = z
  .object({
    classification_type: z.enum(CLASSIFICATION_TYPES),
    code: z.string().trim().max(40),
    category: z.string().trim().max(40),
    label: z.string().trim().max(200),
    valid_from: z.string(),
    valid_to: z.string(),
    source: z.string().trim().max(200),
  })
  .refine((v) => !v.valid_from || !v.valid_to || v.valid_to >= v.valid_from, {
    path: ['valid_to'],
    message: 'La fin de validité précède son début.',
  });
type FormValues = z.infer<typeof formSchema>;

const defaults: FormValues = {
  classification_type: 'ERP',
  code: '',
  category: '',
  label: '',
  valid_from: '',
  valid_to: '',
  source: '',
};

/** « ERP type J · 3e cat. » : what the classification says, in one line. */
export function classificationTitle(item: Classification): string {
  return `${CLASSIFICATION_TYPE_LABELS[item.classification_type]}${item.code ? ` type ${item.code}` : ''}${
    item.category ? ` · ${item.category}e cat.` : ''
  }`;
}

function ClassificationRow({
  item,
  canWrite,
  closing,
  onClose,
}: {
  item: Classification;
  canWrite: boolean;
  closing: boolean;
  onClose: () => void;
}) {
  const current = isCurrent(item);
  const period = [
    formatDate(item.valid_from) ? `du ${formatDate(item.valid_from)}` : null,
    formatDate(item.valid_to) ? `au ${formatDate(item.valid_to)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <li
      className={cn(
        'grid gap-3 px-5 py-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center',
        !current && 'opacity-70',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-md',
          current ? 'bg-subtle text-brand-navy' : 'bg-subtle text-muted',
        )}
      >
        <ScrollText className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{classificationTitle(item)}</span>
          <Badge tone={current ? 'success' : 'neutral'}>{current ? 'En vigueur' : 'Historique'}</Badge>
        </p>
        {item.label ? <p className="text-sm text-foreground">{item.label}</p> : null}
        <p className="text-xs text-muted">
          {period || 'Sans date de validité'}
          {item.source ? ` · source : ${item.source}` : ''}
        </p>
      </div>
      {canWrite && current && !item.valid_to ? (
        <Button size="sm" variant="ghost" disabled={closing} onClick={onClose}>
          Clore aujourd’hui
        </Button>
      ) : null}
    </li>
  );
}

export function ClassificationsPanel({ siteId }: { siteId: string }) {
  const canWrite = usePermissions().has('site:write');
  const classifications = useClassifications(siteId);
  const [adding, setAdding] = useState(false);
  const invalidate = (tenantId: string) => [queryKeys.siteRecords(tenantId, siteId, 'classifications')];
  const create = useApiMutation(
    (options, input: ClassificationCreate) => api.createClassification(options, siteId, input),
    invalidate,
  );
  const close = useApiMutation(
    (options, classification: Classification) =>
      api.updateClassification(options, classification.id, classification.row_version, { valid_to: today() }),
    invalidate,
  );
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults });

  if (classifications.isPending) return <LoadingCard lines={3} />;
  if (classifications.error) return <ApiErrorAlert error={classifications.error} />;
  const current = classifications.data.filter((item) => isCurrent(item)).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success" className="px-3 py-1 text-sm">
            {current} en vigueur
          </Badge>
          {classifications.data.length > current ? (
            <Badge className="px-3 py-1 text-sm">{classifications.data.length - current} historique(s)</Badge>
          ) : null}
        </div>
        {canWrite && !adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Ajouter une classification
          </Button>
        ) : null}
      </div>

      {canWrite && adding ? (
        <SectionCard
          icon={Stamp}
          title="Ajouter une classification"
          description="Le classement réglementaire du site, avec sa période de validité et sa source."
        >
          <form
            noValidate
            className="grid gap-3 md:grid-cols-4"
            onSubmit={handleSubmit(async (values) => {
              await create.mutateAsync({
                classification_type: values.classification_type,
                code: blankToNull(values.code),
                category: blankToNull(values.category),
                label: blankToNull(values.label),
                valid_from: blankToNull(values.valid_from),
                valid_to: blankToNull(values.valid_to),
                source: blankToNull(values.source),
              });
              reset(defaults);
              setAdding(false);
            })}
          >
            {create.error ? (
              <div className="md:col-span-4">
                <ApiErrorAlert error={create.error} />
              </div>
            ) : null}
            <Field label="Classification" htmlFor="cls-type">
              <Select id="cls-type" {...register('classification_type')}>
                {CLASSIFICATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {CLASSIFICATION_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Type / code" htmlFor="cls-code" hint="Ex. J, U, GHA, seuil haut" error={errors.code?.message}>
              <Input id="cls-code" {...register('code')} />
            </Field>
            <Field label="Catégorie" htmlFor="cls-category" hint="Ex. 3" error={errors.category?.message}>
              <Input id="cls-category" {...register('category')} />
            </Field>
            <Field label="Source" htmlFor="cls-source" hint="Arrêté, commission…" error={errors.source?.message}>
              <Input id="cls-source" {...register('source')} />
            </Field>
            <Field label="Libellé" htmlFor="cls-label" error={errors.label?.message} className="md:col-span-2">
              <Input id="cls-label" placeholder="Locaux à sommeil" {...register('label')} />
            </Field>
            <Field label="Début de validité" htmlFor="cls-from" error={errors.valid_from?.message}>
              <Input id="cls-from" type="date" {...register('valid_from')} />
            </Field>
            <Field label="Fin de validité" htmlFor="cls-to" error={errors.valid_to?.message}>
              <Input id="cls-to" type="date" {...register('valid_to')} />
            </Field>
            <div className="flex gap-2 md:col-span-4">
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending ? 'Enregistrement…' : 'Ajouter'}
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>
                Annuler
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      {close.error ? <ApiErrorAlert error={close.error} /> : null}
      {classifications.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
          >
            <ScrollText className="size-6" />
          </span>
          <p className="font-semibold text-foreground">Aucune classification enregistrée.</p>
          <p className="text-sm text-muted">
            ERP, IGH, ICPE, SEVESO… ce que le site est au regard de la réglementation.
          </p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border" aria-label="Classifications réglementaires">
            {classifications.data.map((item) => (
              <ClassificationRow
                key={item.id}
                item={item}
                canWrite={canWrite}
                closing={close.isPending}
                onClose={() => close.mutate(item)}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
