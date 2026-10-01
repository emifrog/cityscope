'use client';

import type { ContributionCreateInput, PortalSite } from '@etare/contracts';
import { MAX_CONTRIBUTION_FILES, type ContributionOperation, type ContributionTarget } from '@etare/domain';
import { Button, Field, Input, Select, Textarea } from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import { CONTRIBUTION_FIELD_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { UPLOAD_ACCEPT, describeFile, sendToQuarantine } from '@/lib/file-upload';
import { queryKeys, useApiMutation } from '@/lib/queries';

interface Choice {
  readonly key: string;
  readonly target: ContributionTarget;
  readonly operation: ContributionOperation;
  readonly label: string;
  readonly title: string;
  /** Element of the published version to designate. */
  readonly pick?: 'contacts' | 'plans' | 'documents';
}

const OTHER: Choice = {
  key: 'other',
  target: 'other',
  operation: 'create',
  label: 'Autre information (stockage, travaux, accès…)',
  title: '',
};

const CHOICES: readonly Choice[] = [
  {
    key: 'site',
    target: 'site',
    operation: 'update',
    label: 'Corriger le nom ou l’adresse du site',
    title: 'Correction du nom ou de l’adresse',
  },
  {
    key: 'contact-update',
    target: 'contact',
    operation: 'update',
    label: 'Modifier un contact',
    title: 'Mise à jour du contact',
    pick: 'contacts',
  },
  {
    key: 'contact-create',
    target: 'contact',
    operation: 'create',
    label: 'Ajouter un contact',
    title: 'Nouveau contact',
  },
  {
    key: 'contact-delete',
    target: 'contact',
    operation: 'delete',
    label: 'Retirer un contact',
    title: 'Contact à retirer',
    pick: 'contacts',
  },
  {
    key: 'plan-update',
    target: 'plan',
    operation: 'update',
    label: 'Signaler un plan à mettre à jour',
    title: 'Plan à mettre à jour',
    pick: 'plans',
  },
  {
    key: 'plan-create',
    target: 'plan',
    operation: 'create',
    label: 'Transmettre un nouveau plan',
    title: 'Nouveau plan',
  },
  {
    key: 'plan-delete',
    target: 'plan',
    operation: 'delete',
    label: 'Signaler un plan obsolète',
    title: 'Plan obsolète',
    pick: 'plans',
  },
  {
    key: 'document-update',
    target: 'document',
    operation: 'update',
    label: 'Transmettre une nouvelle version d’un document',
    title: 'Nouvelle version du document',
    pick: 'documents',
  },
  {
    key: 'document-create',
    target: 'document',
    operation: 'create',
    label: 'Transmettre un nouveau document',
    title: 'Nouveau document',
  },
  {
    key: 'document-delete',
    target: 'document',
    operation: 'delete',
    label: 'Signaler un document obsolète',
    title: 'Document obsolète',
    pick: 'documents',
  },
  OTHER,
];

const CONTACT_FIELDS = ['name', 'role', 'phone', 'phone_alt', 'email', 'availability'] as const;
const SITE_FIELDS = ['name', 'street', 'postal_code', 'city'] as const;
const REQUIRED = new Set(['name', 'phone', 'city']);
type Values = Record<string, string>;

function labelOf(site: PortalSite, pick: Choice['pick'], id: string): string {
  if (pick === 'contacts') return site.contacts.find((contact) => contact.id === id)?.name ?? '';
  if (pick === 'plans') return site.plans.find((plan) => plan.id === id)?.title ?? '';
  return site.documents.find((document) => document.id === id)?.title ?? '';
}

/** Published values of the designated element, as the form starts from them. */
function startingValues(site: PortalSite, choice: Choice, targetId: string): Values {
  if (choice.target === 'site') {
    return {
      name: site.name,
      street: site.address?.street ?? '',
      postal_code: site.address?.postal_code ?? '',
      city: site.address?.city ?? '',
    };
  }
  if (choice.target === 'contact' && choice.operation === 'update') {
    const contact = site.contacts.find((candidate) => candidate.id === targetId);
    return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, contact?.[field] ?? '']));
  }
  return {};
}

/** Only the fields changed (an update) or filled (a new contact) are proposed. */
function proposedValue(fields: readonly string[], start: Values, values: Values, creating: boolean) {
  const entries = fields.flatMap((field) => {
    const value = (values[field] ?? '').trim();
    if (creating) return value ? [[field, value]] : [];
    return value === (start[field] ?? '').trim() ? [] : [[field, value || null]];
  });
  return Object.fromEntries(entries) as Record<string, string | null>;
}

/**
 * Proposal of an update by the exploitant (POR-03): designates what it is
 * about in the published version, carries the values proposed and files. It
 * never changes anything by itself: the SIS instructs it.
 */
export function ContributionForm({ site, onDone }: { site: PortalSite; onDone: () => void }) {
  const published = site.publication !== null;
  const choices = CHOICES.filter(
    (choice) => (!choice.pick || site[choice.pick].length > 0) && (choice.target !== 'site' || published),
  );
  const [choiceKey, setChoiceKey] = useState(OTHER.key);
  const choice = choices.find((candidate) => candidate.key === choiceKey) ?? OTHER;
  const [targetId, setTargetId] = useState('');
  const [values, setValues] = useState<Values>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const start = startingValues(site, choice, targetId);
  const fields =
    choice.target === 'site'
      ? SITE_FIELDS
      : choice.target === 'contact' && choice.operation !== 'delete'
        ? CONTACT_FIELDS
        : [];

  const submit = useApiMutation(
    async (options, input: Omit<ContributionCreateInput, 'files'>) => {
      const described = await Promise.all(files.map((file) => describeFile(file)));
      const receipt = await api.createPortalContribution(options, site.id, {
        ...input,
        files: described.map((file) => file.declaration),
      });
      for (const { sha256, upload } of receipt.uploads) {
        const file = described.find((candidate) => candidate.declaration.sha256 === sha256);
        if (file) await sendToQuarantine(upload, file.content, options.fetchImpl);
      }
      if (receipt.uploads.length > 0) await api.confirmPortalContributionUploads(options, receipt.contribution.id);
      return receipt;
    },
    (tenantId) => [queryKeys.portalContributions(tenantId)],
  );

  function choose(key: string) {
    const next = choices.find((candidate) => candidate.key === key);
    setChoiceKey(key);
    setTargetId('');
    setTitle(next?.title ?? '');
    setValues(next ? startingValues(site, next, '') : {});
    setProblem(null);
  }

  function pickTarget(id: string) {
    setTargetId(id);
    setValues(startingValues(site, choice, id));
    setTitle(id ? `${choice.title} « ${labelOf(site, choice.pick, id)} »` : choice.title);
  }

  function send() {
    if (choice.pick && !targetId) return setProblem('Choisissez l’élément concerné.');
    if (!title.trim() || !description.trim()) return setProblem('Donnez un titre et décrivez la mise à jour.');
    if (files.length > MAX_CONTRIBUTION_FILES) return setProblem(`${MAX_CONTRIBUTION_FILES} fichiers au plus.`);
    const creating = choice.operation === 'create';
    const proposed = fields.length > 0 ? proposedValue(fields, { ...start }, values, creating) : null;
    if (proposed && Object.keys(proposed).length === 0) return setProblem('Modifiez au moins une valeur.');
    setProblem(null);
    submit.mutate(
      {
        target_type: choice.target,
        operation: choice.operation,
        target_id: choice.pick ? targetId : null,
        title: title.trim(),
        description: description.trim(),
        proposed_value: proposed,
      },
      { onSuccess: () => onDone() },
    );
  }

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <Field label="Votre proposition porte sur" htmlFor="contribution-choice" className="md:col-span-2">
        <Select id="contribution-choice" value={choiceKey} onChange={(event) => choose(event.target.value)}>
          {choices.map((candidate) => (
            <option key={candidate.key} value={candidate.key}>
              {candidate.label}
            </option>
          ))}
        </Select>
      </Field>
      {choice.pick ? (
        <Field label="Élément concerné" htmlFor="contribution-target" className="md:col-span-2">
          <Select id="contribution-target" value={targetId} onChange={(event) => pickTarget(event.target.value)}>
            <option value="">Choisir…</option>
            {site[choice.pick].map((element) => (
              <option key={element.id} value={element.id}>
                {'name' in element ? element.name : element.title}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {fields.length > 0 && (!choice.pick || targetId)
        ? fields.map((field) => (
            <Field
              key={field}
              label={`${CONTRIBUTION_FIELD_LABELS[field]}${choice.operation === 'create' && REQUIRED.has(field) ? ' *' : ''}`}
              htmlFor={`contribution-${field}`}
            >
              <Input
                id={`contribution-${field}`}
                type={field === 'email' ? 'email' : field.startsWith('phone') ? 'tel' : 'text'}
                value={values[field] ?? ''}
                onChange={(event) => setValues((current) => ({ ...current, [field]: event.target.value }))}
              />
            </Field>
          ))
        : null}
      <Field label="Titre" htmlFor="contribution-title" className="md:col-span-2">
        <Input
          id="contribution-title"
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>
      <Field
        label="Description"
        htmlFor="contribution-description"
        hint="Ce qui a changé, depuis quand, et toute précision utile aux secours."
        className="md:col-span-2"
      >
        <Textarea
          id="contribution-description"
          rows={4}
          maxLength={4000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field
        label="Pièces jointes"
        htmlFor="contribution-files"
        hint={`Photos ou plans : PDF, PNG, JPEG ou WebP, 50 Mo et ${MAX_CONTRIBUTION_FILES} fichiers au plus. Chaque fichier est contrôlé avant d’être consulté par le SIS.`}
        className="md:col-span-2"
      >
        <Input
          id="contribution-files"
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="h-auto py-2 text-sm"
          onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
        />
      </Field>
      <div className="space-y-2 md:col-span-2" aria-live="polite">
        {problem ? <p className="text-sm text-critical">{problem}</p> : null}
        {submit.error ? <ApiErrorAlert error={submit.error} /> : null}
      </div>
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <Button type="submit" size="sm" disabled={submit.isPending}>
          {submit.isPending ? 'Envoi…' : 'Envoyer au SIS'}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={submit.isPending} onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
