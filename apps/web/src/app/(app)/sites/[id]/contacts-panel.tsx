'use client';

import type { Contact, ContactCreateInput } from '@etare/contracts';
import { CONTACT_VISIBILITIES } from '@etare/domain';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { Phone } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { blankToNull } from '@/components/form-helpers';
import { CONTACT_VISIBILITY_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useContacts, usePermissions } from '@/lib/queries';

const PHONE = /^(\+?[0-9][0-9 .()-]{5,23})?$/;
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

const formSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est obligatoire.').max(200),
  role: z.string().trim().max(200),
  phone: z.string().trim().min(1, 'Le téléphone est obligatoire.').regex(PHONE, 'Numéro de téléphone invalide.'),
  phone_alt: z.string().trim().regex(PHONE, 'Numéro de téléphone invalide.'),
  email: z.union([z.literal(''), z.email('Adresse e-mail invalide.')]),
  availability: z.string().trim().max(200),
  visibility: z.enum(CONTACT_VISIBILITIES),
});
type FormValues = z.infer<typeof formSchema>;

const defaults = (contact?: Contact): FormValues => ({
  name: contact?.name ?? '',
  role: contact?.role ?? '',
  phone: contact?.phone ?? '',
  phone_alt: contact?.phone_alt ?? '',
  email: contact?.email ?? '',
  availability: contact?.availability ?? '',
  visibility: contact?.visibility ?? 'prevision',
});

const toPayload = (values: FormValues): ContactCreateInput => ({
  name: values.name.trim(),
  role: blankToNull(values.role),
  phone: values.phone.trim(),
  phone_alt: blankToNull(values.phone_alt),
  email: blankToNull(values.email),
  availability: blankToNull(values.availability),
  visibility: values.visibility,
});

function ContactForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Contact | undefined;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (payload: ContactCreateInput) => Promise<unknown>;
  onCancel?: () => void;
}) {
  const prefix = initial?.id ?? 'new-contact';
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: defaults(initial) });

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-3"
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(toPayload(values));
        if (!initial) reset(defaults());
      })}
    >
      {error ? (
        <div className="md:col-span-3">
          <ApiErrorAlert error={error} />
        </div>
      ) : null}
      <Field label="Nom" htmlFor={`${prefix}-name`} error={errors.name?.message}>
        <Input id={`${prefix}-name`} {...register('name')} />
      </Field>
      <Field label="Fonction" htmlFor={`${prefix}-role`} error={errors.role?.message}>
        <Input id={`${prefix}-role`} placeholder="PC sécurité, astreinte technique…" {...register('role')} />
      </Field>
      <Field label="Disponibilité" htmlFor={`${prefix}-availability`} error={errors.availability?.message}>
        <Input id={`${prefix}-availability`} placeholder="24/7, heures ouvrées…" {...register('availability')} />
      </Field>
      <Field label="Téléphone" htmlFor={`${prefix}-phone`} error={errors.phone?.message}>
        <Input id={`${prefix}-phone`} type="tel" {...register('phone')} />
      </Field>
      <Field label="Autre téléphone" htmlFor={`${prefix}-phone-alt`} error={errors.phone_alt?.message}>
        <Input id={`${prefix}-phone-alt`} type="tel" {...register('phone_alt')} />
      </Field>
      <Field label="E-mail" htmlFor={`${prefix}-email`} error={errors.email?.message}>
        <Input id={`${prefix}-email`} type="email" {...register('email')} />
      </Field>
      <Field
        label="Diffusion"
        htmlFor={`${prefix}-visibility`}
        hint="Par défaut, un contact reste interne au SIS."
        className="md:col-span-3"
      >
        <Select id={`${prefix}-visibility`} {...register('visibility')}>
          {CONTACT_VISIBILITIES.map((visibility) => (
            <option key={visibility} value={visibility}>
              {CONTACT_VISIBILITY_LABELS[visibility]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2 md:col-span-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Enregistrement…' : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ContactCard({ siteId, contact, canWrite }: { siteId: string; contact: Contact; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const update = useApiMutation(
    (options, patch: Parameters<typeof api.updateContact>[3]) =>
      api.updateContact(options, contact.id, contact.row_version, patch),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'contacts')],
  );
  const archived = contact.status === 'archived';

  return (
    <Card className={archived ? 'opacity-70' : undefined}>
      <CardContent className="space-y-3">
        {editing ? (
          <ContactForm
            initial={contact}
            submitLabel="Enregistrer"
            pending={update.isPending}
            error={update.error}
            onSubmit={async (payload) => {
              await update.mutateAsync(payload);
              setEditing(false);
            }}
            onCancel={() => {
              update.reset();
              setEditing(false);
            }}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{contact.name}</p>
                {contact.role ? <p className="text-sm text-muted">{contact.role}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={contact.visibility === 'ops' ? 'info' : 'neutral'}>
                  {CONTACT_VISIBILITY_LABELS[contact.visibility]}
                </Badge>
                {archived ? <Badge>Archivé</Badge> : null}
              </div>
            </div>
            <p className="flex items-center gap-2 text-sm">
              <Phone aria-hidden="true" className="size-4 text-muted" />
              <a href={`tel:${contact.phone.replace(/[^+0-9]/g, '')}`} className="font-semibold text-info">
                {contact.phone}
              </a>
              {contact.phone_alt ? <span className="text-muted">· {contact.phone_alt}</span> : null}
            </p>
            <p className="text-sm text-muted">
              {[contact.email, contact.availability].filter(Boolean).join(' · ')}
              {contact.verified_at
                ? ` · vérifié le ${dateFormat.format(new Date(contact.verified_at))}`
                : ' · jamais vérifié'}
            </p>
            {update.error ? <ApiErrorAlert error={update.error} /> : null}
            {canWrite ? (
              <div className="flex flex-wrap gap-2">
                {!archived ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={update.isPending}
                    onClick={() => update.mutate({ verified: true })}
                  >
                    Marquer comme vérifié
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ status: archived ? 'active' : 'archived' })}
                >
                  {archived ? 'Réactiver' : 'Archiver'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function ContactsPanel({ siteId }: { siteId: string }) {
  const canWrite = usePermissions().has('site:write');
  const contacts = useContacts(siteId);
  const [adding, setAdding] = useState(false);
  const create = useApiMutation(
    (options, input: ContactCreateInput) => api.createContact(options, siteId, input),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'contacts')],
  );

  if (contacts.isPending) return <LoadingCard lines={3} />;
  if (contacts.error) return <ApiErrorAlert error={contacts.error} />;

  return (
    <div className="space-y-4">
      {canWrite ? (
        adding ? (
          <Card>
            <CardHeader>
              <CardTitle>Nouveau contact</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactForm
                submitLabel="Ajouter le contact"
                pending={create.isPending}
                error={create.error}
                onSubmit={async (payload) => {
                  await create.mutateAsync(payload);
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setAdding(true)}>Ajouter un contact</Button>
        )
      ) : null}
      {contacts.data.length === 0 ? <p className="text-sm text-muted">Aucun contact pour ce site.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {contacts.data.map((contact) => (
          <ContactCard
            key={`${contact.id}-${contact.row_version}`}
            siteId={siteId}
            contact={contact}
            canWrite={canWrite}
          />
        ))}
      </div>
    </div>
  );
}
