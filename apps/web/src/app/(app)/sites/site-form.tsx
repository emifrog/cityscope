'use client';

import type { AddressCandidate, SiteDetail, SiteUpdate } from '@etare/contracts';
import {
  SENSITIVITY_LEVELS,
  SITE_STATUSES,
  SITE_TYPES,
  type Sensitivity,
  type SiteStatus,
  type SiteType,
} from '@etare/domain';
import { Button, Field, Input, Select } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert } from '@/components/feedback';
import { applyServerFieldErrors, blankToNull, isOptionalNumber, numberOrNull } from '@/components/form-helpers';
import { SENSITIVITY_LABELS, SITE_STATUS_LABELS, SITE_TYPE_LABELS } from '@/components/labels';

/** Form values are strings as typed; the server validates the converted payload again. */
const siteFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
    short_name: z.string().trim().max(80),
    site_type: z.enum(SITE_TYPES),
    status: z.enum(SITE_STATUSES),
    sensitivity: z.enum(SENSITIVITY_LEVELS),
    etare_number: z.string().trim().max(40),
    street: z.string().trim().max(200),
    postal_code: z
      .string()
      .trim()
      .regex(/^([0-9]{5})?$/, 'Code postal à 5 chiffres.'),
    city: z.string().trim().max(120),
    insee_code: z
      .string()
      .trim()
      .regex(/^([0-9][0-9AB][0-9]{3})?$/, 'Code INSEE à 5 caractères.'),
    latitude: z.string().refine((value) => isOptionalNumber(value, -90, 90), 'Latitude entre -90 et 90.'),
    longitude: z.string().refine((value) => isOptionalNumber(value, -180, 180), 'Longitude entre -180 et 180.'),
  })
  .superRefine((values, ctx) => {
    if ((values.street || values.postal_code || values.insee_code) && !values.city) {
      ctx.addIssue({ code: 'custom', path: ['city'], message: 'La commune est obligatoire pour une adresse.' });
    }
    if (Boolean(values.latitude.trim()) !== Boolean(values.longitude.trim())) {
      ctx.addIssue({ code: 'custom', path: ['longitude'], message: 'Renseignez latitude et longitude ensemble.' });
    }
  });
export type SiteFormValues = z.infer<typeof siteFormSchema>;

export function siteFormDefaults(site?: SiteDetail): SiteFormValues {
  const [longitude, latitude] = site?.location?.coordinates ?? [];
  return {
    name: site?.name ?? '',
    short_name: site?.short_name ?? '',
    site_type: site?.site_type ?? 'erp',
    status: site?.status ?? 'draft',
    sensitivity: site?.sensitivity ?? 'normal',
    etare_number: site?.etare_number ?? '',
    street: site?.address?.street ?? '',
    postal_code: site?.address?.postal_code ?? '',
    city: site?.address?.city ?? '',
    insee_code: site?.address?.insee_code ?? '',
    latitude: latitude?.toString() ?? '',
    longitude: longitude?.toString() ?? '',
  };
}

/** Complete site payload: valid for a creation (draft/active) and for an update. */
export interface SitePayload extends SiteUpdate {
  name: string;
  site_type: SiteType;
  status: SiteStatus;
  sensitivity: Sensitivity;
}

/** Converts the form into the API payload (empty text clears the value). */
export function toSitePayload(values: SiteFormValues): SitePayload {
  const latitude = numberOrNull(values.latitude);
  const longitude = numberOrNull(values.longitude);
  return {
    name: values.name.trim(),
    short_name: blankToNull(values.short_name),
    site_type: values.site_type,
    status: values.status,
    sensitivity: values.sensitivity,
    etare_number: blankToNull(values.etare_number),
    address: values.city.trim()
      ? {
          street: blankToNull(values.street),
          postal_code: blankToNull(values.postal_code),
          city: values.city.trim(),
          insee_code: blankToNull(values.insee_code),
        }
      : null,
    location: latitude !== null && longitude !== null ? { type: 'Point', coordinates: [longitude, latitude] } : null,
  };
}

export function SiteForm({
  mode,
  initial,
  submitting,
  error,
  onSubmit,
  onCancel,
  addressSearch,
}: {
  mode: 'create' | 'edit';
  initial?: SiteDetail | undefined;
  submitting: boolean;
  error: unknown;
  onSubmit: (payload: SitePayload) => Promise<unknown>;
  onCancel?: (() => void) | undefined;
  /** Address search field (needs the API): fills the address and the reference point. */
  addressSearch?: ((apply: (candidate: AddressCandidate) => void) => ReactNode) | undefined;
}) {
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors },
  } = useForm<SiteFormValues>({ resolver: zodResolver(siteFormSchema), defaultValues: siteFormDefaults(initial) });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(toSitePayload(values));
    } catch (failure) {
      applyServerFieldErrors(failure, setError, {
        'address.postal_code': 'postal_code',
        'address.city': 'city',
        'address.street': 'street',
        'address.insee_code': 'insee_code',
        'location.coordinates.0': 'longitude',
        'location.coordinates.1': 'latitude',
      });
    }
  });

  const applyCandidate = (candidate: AddressCandidate) => {
    const [longitude, latitude] = candidate.location.coordinates;
    const options = { shouldDirty: true, shouldValidate: true };
    setValue('street', candidate.street ?? '', options);
    setValue('postal_code', candidate.postal_code ?? '', options);
    setValue('city', candidate.city, options);
    setValue('insee_code', candidate.insee_code ?? '', options);
    setValue('latitude', String(latitude), options);
    setValue('longitude', String(longitude), options);
  };

  const statuses = mode === 'create' ? (['draft', 'active'] as const) : SITE_STATUSES;
  const invalid = (name: keyof SiteFormValues) => (errors[name] ? true : undefined);

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      {error ? <ApiErrorAlert error={error} /> : null}

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">Identification</legend>
        <Field label="Nom du site" htmlFor="name" error={errors.name?.message} className="md:col-span-2">
          <Input id="name" aria-invalid={invalid('name')} {...register('name')} />
        </Field>
        <Field label="Nom court" htmlFor="short_name" error={errors.short_name?.message}>
          <Input id="short_name" {...register('short_name')} />
        </Field>
        <Field
          label="N° ETARE"
          htmlFor="etare_number"
          error={errors.etare_number?.message}
          hint="Unique dans votre SIS."
        >
          <Input id="etare_number" {...register('etare_number')} />
        </Field>
        <Field label="Type de site" htmlFor="site_type">
          <Select id="site_type" {...register('site_type')}>
            {SITE_TYPES.map((type) => (
              <option key={type} value={type}>
                {SITE_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Statut" htmlFor="status">
          <Select id="status" {...register('status')}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {SITE_STATUS_LABELS[status]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Sensibilité"
          htmlFor="sensitivity"
          hint="Un site sensible pourra avoir une diffusion hors ligne restreinte."
        >
          <Select id="sensitivity" {...register('sensitivity')}>
            {SENSITIVITY_LEVELS.map((level) => (
              <option key={level} value={level}>
                {SENSITIVITY_LABELS[level]}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold text-foreground">Adresse</legend>
        {addressSearch ? (
          <Field
            label="Rechercher l’adresse"
            htmlFor="address-search"
            hint="Remplit l’adresse, le code INSEE et le point de référence."
            className="md:col-span-4"
          >
            {addressSearch(applyCandidate)}
          </Field>
        ) : null}
        <Field label="Voie" htmlFor="street" error={errors.street?.message} className="md:col-span-4">
          <Input id="street" autoComplete="off" {...register('street')} />
        </Field>
        <Field label="Code postal" htmlFor="postal_code" error={errors.postal_code?.message}>
          <Input
            id="postal_code"
            inputMode="numeric"
            aria-invalid={invalid('postal_code')}
            {...register('postal_code')}
          />
        </Field>
        <Field label="Commune" htmlFor="city" error={errors.city?.message} className="md:col-span-2">
          <Input id="city" aria-invalid={invalid('city')} {...register('city')} />
        </Field>
        <Field label="Code INSEE" htmlFor="insee_code" error={errors.insee_code?.message}>
          <Input id="insee_code" aria-invalid={invalid('insee_code')} {...register('insee_code')} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 md:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">Point de référence (WGS 84)</legend>
        <Field label="Latitude" htmlFor="latitude" error={errors.latitude?.message} hint="Ex. 43.7079">
          <Input id="latitude" inputMode="decimal" aria-invalid={invalid('latitude')} {...register('latitude')} />
        </Field>
        <Field label="Longitude" htmlFor="longitude" error={errors.longitude?.message} hint="Ex. 7.2518">
          <Input id="longitude" inputMode="decimal" aria-invalid={invalid('longitude')} {...register('longitude')} />
        </Field>
        <p className="text-xs text-muted md:col-span-2">
          Le point peut aussi être déplacé sur la carte, onglet « Localisation » de la fiche.
        </p>
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Enregistrement…' : mode === 'create' ? 'Créer le site' : 'Enregistrer'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  );
}
