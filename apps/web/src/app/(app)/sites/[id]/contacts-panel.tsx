'use client';

import type { Contact, ContactCreateInput } from '@etare/contracts';
import { CONTACT_VISIBILITIES } from '@etare/domain';
import { Badge, Button, Card, Field, Input, Select, cn } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarCheck, CalendarClock, Phone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { blankToNull } from '@/components/form-helpers';
import { CONTACT_VISIBILITY_LABELS } from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useContacts, usePermissions } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { verificationState } from '@/lib/site-verification';

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

/** When the contact was last confirmed by the SIS; amber past a year or never. */
function VerificationLine({ contact, now }: { contact: Contact; now: number }) {
  const state = verificationState(contact.verified_at, now);
  const ok = state === 'verified';
  const Icon = ok ? CalendarCheck : CalendarClock;
  return (
    <span className={cn('inline-flex items-center gap-1', ok ? 'text-success' : 'text-important')}>
      <Icon aria-hidden="true" className="size-3.5" />
      {state === 'never'
        ? 'Jamais vérifié'
        : `${ok ? 'Vérifié' : 'À revérifier, vu'} ${agoLabel(contact.verified_at ?? '', now)} (${dateFormat.format(
            new Date(contact.verified_at ?? 0),
          )})`}
    </span>
  );
}

function ContactRow({
  siteId,
  contact,
  canWrite,
  now,
}: {
  siteId: string;
  contact: Contact;
  canWrite: boolean;
  now: number;
}) {
  const [editing, setEditing] = useState(false);
  const update = useApiMutation(
    (options, patch: Parameters<typeof api.updateContact>[3]) =>
      api.updateContact(options, contact.id, contact.row_version, patch),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'contacts')],
  );
  const archived = contact.status === 'archived';

  return (
    <li className={cn('px-5 py-4', archived && 'opacity-70')}>
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
        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-md',
              contact.visibility === 'ops' ? 'bg-info-soft text-info' : 'bg-subtle text-brand-navy',
            )}
          >
            <Phone className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground">{contact.name}</span>
              {contact.role ? <span className="text-sm text-muted">{contact.role}</span> : null}
              <Badge tone={contact.visibility === 'ops' ? 'info' : 'neutral'}>
                {CONTACT_VISIBILITY_LABELS[contact.visibility]}
              </Badge>
              {archived ? <Badge>Archivé</Badge> : null}
            </p>
            <p className="text-sm">
              <a href={`tel:${contact.phone.replace(/[^+0-9]/g, '')}`} className="font-semibold text-info">
                {contact.phone}
              </a>
              {contact.phone_alt ? <span className="text-muted"> · {contact.phone_alt}</span> : null}
              {contact.email ? <span className="text-muted"> · {contact.email}</span> : null}
              {contact.availability ? <span className="text-muted"> · {contact.availability}</span> : null}
            </p>
            <p className="text-xs">
              <VerificationLine contact={contact} now={now} />
            </p>
            {update.error ? <ApiErrorAlert error={update.error} /> : null}
          </div>
          {canWrite ? (
            <div className="flex flex-wrap gap-1 md:max-w-52 md:justify-end">
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
        </div>
      )}
    </li>
  );
}

export function ContactsPanel({ siteId }: { siteId: string }) {
  const canWrite = usePermissions().has('site:write');
  const contacts = useContacts(siteId);
  const [adding, setAdding] = useState(false);
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());
  const create = useApiMutation(
    (options, input: ContactCreateInput) => api.createContact(options, siteId, input),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'contacts')],
  );

  if (contacts.isPending) return <LoadingCard lines={3} />;
  if (contacts.error) return <ApiErrorAlert error={contacts.error} />;
  const active = contacts.data.filter((contact) => contact.status === 'active');
  const shared = active.filter((contact) => contact.visibility === 'ops').length;
  const stale = active.filter((contact) => verificationState(contact.verified_at, now) !== 'verified').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="info" className="px-3 py-1 text-sm">
            {shared} diffusé{shared > 1 ? 's' : ''} aux intervenants
          </Badge>
          {stale > 0 ? (
            <Badge tone="important" className="px-3 py-1 text-sm">
              {stale} à vérifier
            </Badge>
          ) : null}
        </div>
        {canWrite && !adding ? (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Ajouter un contact
          </Button>
        ) : null}
      </div>
      {canWrite && adding ? (
        <SectionCard
          icon={Phone}
          title="Nouveau contact"
          description="Qui joindre sur place : les intervenants ne voient que les contacts diffusés."
        >
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
        </SectionCard>
      ) : null}
      {contacts.data.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
          >
            <Phone className="size-6" />
          </span>
          <p className="font-semibold text-foreground">Aucun contact pour ce site.</p>
          <p className="text-sm text-muted">PC sécurité, astreinte technique, direction : qui répond à toute heure.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-border" aria-label="Contacts du site">
            {contacts.data.map((contact) => (
              <ContactRow
                key={`${contact.id}-${contact.row_version}`}
                siteId={siteId}
                contact={contact}
                canWrite={canWrite}
                now={now}
              />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
