'use client';

import type { Classification, ClassificationCreate } from '@etare/contracts';
import { CLASSIFICATION_TYPES } from '@etare/domain';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Select,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { blankToNull } from '@/components/form-helpers';
import { CLASSIFICATION_TYPE_LABELS } from '@/components/labels';
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

export function ClassificationsPanel({ siteId }: { siteId: string }) {
  const canWrite = usePermissions().has('site:write');
  const classifications = useClassifications(siteId);
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Classifications réglementaires</CardTitle>
        </CardHeader>
        {close.error ? (
          <div className="px-5 pt-3">
            <ApiErrorAlert error={close.error} />
          </div>
        ) : null}
        {classifications.data.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Aucune classification enregistrée.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Classification</TableHeaderCell>
                <TableHeaderCell>Libellé</TableHeaderCell>
                <TableHeaderCell>Validité</TableHeaderCell>
                <TableHeaderCell>Source</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Actions</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <tbody>
              {classifications.data.map((item) => {
                const current = isCurrent(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <strong>{CLASSIFICATION_TYPE_LABELS[item.classification_type]}</strong>
                      {item.code ? ` type ${item.code}` : ''}
                      {item.category ? ` · ${item.category}e cat.` : ''}
                    </TableCell>
                    <TableCell>{item.label ?? '—'}</TableCell>
                    <TableCell>
                      <Badge tone={current ? 'success' : 'neutral'}>{current ? 'En vigueur' : 'Historique'}</Badge>{' '}
                      <span className="text-xs text-muted">
                        {formatDate(item.valid_from) ? `du ${formatDate(item.valid_from)} ` : ''}
                        {formatDate(item.valid_to) ? `au ${formatDate(item.valid_to)}` : ''}
                      </span>
                    </TableCell>
                    <TableCell>{item.source ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      {canWrite && current && !item.valid_to ? (
                        <Button size="sm" variant="ghost" disabled={close.isPending} onClick={() => close.mutate(item)}>
                          Clore aujourd’hui
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      {canWrite ? (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter une classification</CardTitle>
          </CardHeader>
          <CardContent>
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
              <Field
                label="Type / code"
                htmlFor="cls-code"
                hint="Ex. J, U, GHA, seuil haut"
                error={errors.code?.message}
              >
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
              <div className="md:col-span-4">
                <Button type="submit" size="sm" disabled={create.isPending}>
                  Ajouter
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
