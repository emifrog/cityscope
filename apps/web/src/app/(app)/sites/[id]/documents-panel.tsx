'use client';

import type { Document, DocumentUpdate, DocumentVersion } from '@etare/contracts';
import { DOCUMENT_CATEGORIES, OFFLINE_POLICIES, type ScanStatus } from '@etare/domain';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, Select } from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { blankToNull } from '@/components/form-helpers';
import {
  DOCUMENT_CATEGORY_LABELS,
  OFFLINE_POLICY_LABELS,
  REJECTION_REASON_LABELS,
  SCAN_STATUS_LABELS,
} from '@/components/labels';
import { api } from '@/lib/api-client';
import { UPLOAD_ACCEPT, type UploadStep } from '@/lib/file-upload';
import {
  queryKeys,
  useApiMutation,
  useDocumentUpload,
  useDocuments,
  usePermissions,
  type DocumentUploadVariables,
} from '@/lib/queries';

const sizeFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} Ko`;
  return `${sizeFormat.format(bytes / 1024 / 1024)} Mo`;
}

const STEP_LABELS: Readonly<Record<UploadStep, string>> = {
  reading: 'Calcul de l’empreinte du fichier…',
  declaring: 'Déclaration du fichier…',
  sending: 'Envoi du fichier…',
  confirming: 'Demande de contrôle…',
};

const SCAN_TONES: Readonly<Record<ScanStatus, 'info' | 'success' | 'critical'>> = {
  pending: 'info',
  clean: 'success',
  rejected: 'critical',
};

const datesShape = { valid_from: z.string(), expires_at: z.string() };
const datesInOrder = (values: { valid_from: string; expires_at: string }) =>
  !values.valid_from || !values.expires_at || values.expires_at >= values.valid_from;
const DATES_ERROR = { message: 'La date d’expiration précède la date de début de validité.', path: ['expires_at'] };

const metaShape = {
  title: z.string().trim().min(1, 'Le titre est obligatoire.').max(200),
  category: z.enum(DOCUMENT_CATEGORIES),
  offline_policy: z.enum(OFFLINE_POLICIES),
};
const metaSchema = z.object(metaShape);
const newDocumentSchema = z.object({ ...metaShape, ...datesShape }).refine(datesInOrder, DATES_ERROR);
const versionSchema = z.object(datesShape).refine(datesInOrder, DATES_ERROR);

type MetaValues = z.infer<typeof metaSchema>;
type NewDocumentValues = z.infer<typeof newDocumentSchema>;
type VersionValues = z.infer<typeof versionSchema>;

/** Opens a short-lived URL without giving the new tab access to this page. */
function openInNewTab(url: string) {
  const link = window.document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.click();
}

/** File choice and upload progress shared by the "new document" and "new version" forms. */
function useUploadForm(siteId: string) {
  const upload = useDocumentUpload(siteId);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();

  const submit = async (declare: DocumentUploadVariables['declare']): Promise<boolean> => {
    if (!file) {
      setFileError('Choisissez un fichier.');
      return false;
    }
    try {
      await upload.mutateAsync({ file, declare });
      return true;
    } catch {
      return false; // shown through upload.error
    }
  };

  return { upload, file, setFile, fileError, setFileError, submit };
}

function FileField({
  id,
  error,
  onChange,
}: {
  id: string;
  error: string | undefined;
  onChange: (file: File | null) => void;
}) {
  return (
    <Field
      label="Fichier"
      htmlFor={id}
      error={error}
      hint="PDF, PNG, JPEG ou WebP, 50 Mo maximum. Le fichier n’est consultable qu’après son contrôle."
      className="md:col-span-2"
    >
      <Input
        id={id}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="h-auto py-2 text-sm"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
    </Field>
  );
}

function UploadFeedback({ step, error }: { step: UploadStep | null; error: unknown }) {
  return (
    <div className="space-y-2 md:col-span-2" aria-live="polite">
      {step ? <p className="text-sm text-muted">{STEP_LABELS[step]}</p> : null}
      {error ? <ApiErrorAlert error={error} /> : null}
    </div>
  );
}

function DateFields({
  prefix,
  validFrom,
  expiresAt,
  error,
}: {
  prefix: string;
  validFrom: UseFormRegisterReturn;
  expiresAt: UseFormRegisterReturn;
  error: string | undefined;
}) {
  return (
    <>
      <Field label="Valable à partir du" htmlFor={`${prefix}-valid-from`}>
        <Input id={`${prefix}-valid-from`} type="date" {...validFrom} />
      </Field>
      <Field
        label="Expire le"
        htmlFor={`${prefix}-expires-at`}
        error={error}
        hint="Pour une fiche de données de sécurité ou une consigne à revoir."
      >
        <Input id={`${prefix}-expires-at`} type="date" {...expiresAt} />
      </Field>
    </>
  );
}

function NewDocumentForm({ siteId, onClose }: { siteId: string; onClose: () => void }) {
  const { upload, setFile, fileError, setFileError, submit } = useUploadForm(siteId);
  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<NewDocumentValues>({
    resolver: zodResolver(newDocumentSchema),
    defaultValues: { title: '', category: 'instruction', offline_policy: 'never', valid_from: '', expires_at: '' },
  });

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-2"
      onSubmit={handleSubmit(async (values) => {
        const done = await submit((options, file) =>
          api.createDocument(options, siteId, {
            title: values.title.trim(),
            category: values.category,
            offline_policy: values.offline_policy,
            valid_from: blankToNull(values.valid_from),
            expires_at: blankToNull(values.expires_at),
            file,
          }),
        );
        if (done) onClose();
      })}
    >
      <FileField
        id="new-document-file"
        error={fileError}
        onChange={(file) => {
          setFile(file);
          setFileError(undefined);
          // Suggest a title from the file name, without overwriting one already typed.
          if (file && !getValues('title').trim()) {
            setValue('title', file.name.replace(/\.[^.]+$/, ''), { shouldValidate: true });
          }
        }}
      />
      <Field label="Titre" htmlFor="new-document-title" error={errors.title?.message} className="md:col-span-2">
        <Input id="new-document-title" {...register('title')} />
      </Field>
      <Field label="Catégorie" htmlFor="new-document-category">
        <Select id="new-document-category" {...register('category')}>
          {DOCUMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {DOCUMENT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Consultation hors ligne"
        htmlFor="new-document-offline"
        hint="Détermine si le fichier sera embarqué sur les terminaux des intervenants."
      >
        <Select id="new-document-offline" {...register('offline_policy')}>
          {OFFLINE_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {OFFLINE_POLICY_LABELS[policy]}
            </option>
          ))}
        </Select>
      </Field>
      <DateFields
        prefix="new-document"
        validFrom={register('valid_from')}
        expiresAt={register('expires_at')}
        error={errors.expires_at?.message}
      />
      <UploadFeedback step={upload.step} error={upload.error} />
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" size="sm" disabled={upload.isPending}>
          {upload.isPending ? 'Dépôt en cours…' : 'Déposer le document'}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={upload.isPending} onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function NewVersionForm({ siteId, document, onClose }: { siteId: string; document: Document; onClose: () => void }) {
  const { upload, setFile, fileError, setFileError, submit } = useUploadForm(siteId);
  const prefix = `version-${document.id}`;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VersionValues>({
    resolver: zodResolver(versionSchema),
    defaultValues: { valid_from: '', expires_at: '' },
  });

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-2"
      onSubmit={handleSubmit(async (values) => {
        const done = await submit((options, file) =>
          api.createDocumentVersion(options, document.id, {
            valid_from: blankToNull(values.valid_from),
            expires_at: blankToNull(values.expires_at),
            file,
          }),
        );
        if (done) onClose();
      })}
    >
      <FileField
        id={`${prefix}-file`}
        error={fileError}
        onChange={(file) => {
          setFile(file);
          setFileError(undefined);
        }}
      />
      <DateFields
        prefix={prefix}
        validFrom={register('valid_from')}
        expiresAt={register('expires_at')}
        error={errors.expires_at?.message}
      />
      <UploadFeedback step={upload.step} error={upload.error} />
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" size="sm" disabled={upload.isPending}>
          {upload.isPending ? 'Dépôt en cours…' : 'Déposer la nouvelle version'}
        </Button>
        <Button type="button" size="sm" variant="secondary" disabled={upload.isPending} onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function DocumentMetaForm({ siteId, document, onClose }: { siteId: string; document: Document; onClose: () => void }) {
  const prefix = `document-${document.id}`;
  const update = useApiMutation(
    (options, patch: DocumentUpdate) => api.updateDocument(options, document.id, document.row_version, patch),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'documents')],
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MetaValues>({
    resolver: zodResolver(metaSchema),
    defaultValues: { title: document.title, category: document.category, offline_policy: document.offline_policy },
  });

  return (
    <form
      noValidate
      className="grid gap-3 md:grid-cols-2"
      onSubmit={handleSubmit((values) =>
        update.mutate({ ...values, title: values.title.trim() }, { onSuccess: () => onClose() }),
      )}
    >
      {update.error ? (
        <div className="md:col-span-2">
          <ApiErrorAlert error={update.error} />
        </div>
      ) : null}
      <Field label="Titre" htmlFor={`${prefix}-title`} error={errors.title?.message} className="md:col-span-2">
        <Input id={`${prefix}-title`} {...register('title')} />
      </Field>
      <Field label="Catégorie" htmlFor={`${prefix}-category`}>
        <Select id={`${prefix}-category`} {...register('category')}>
          {DOCUMENT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {DOCUMENT_CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Consultation hors ligne" htmlFor={`${prefix}-offline`}>
        <Select id={`${prefix}-offline`} {...register('offline_policy')}>
          {OFFLINE_POLICIES.map((policy) => (
            <option key={policy} value={policy}>
              {OFFLINE_POLICY_LABELS[policy]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" size="sm" disabled={update.isPending}>
          {update.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

const formatDay = (day: string) => dateFormat.format(new Date(`${day}T12:00:00Z`));

function VersionLine({
  version,
  downloading,
  onOpen,
}: {
  version: DocumentVersion;
  downloading: boolean;
  onOpen: (assetId: string) => void;
}) {
  const { asset } = version;
  const validity = [
    version.valid_from ? `valable dès le ${formatDay(version.valid_from)}` : null,
    version.expires_at ? `expire le ${formatDay(version.expires_at)}` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            Version {version.version_no} · {asset.filename}
          </p>
          <p className="text-xs text-muted">
            {[
              formatBytes(asset.size_bytes),
              `déposée le ${dateFormat.format(new Date(version.created_at))}`,
              ...validity,
            ].join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={SCAN_TONES[asset.scan_status]}>{SCAN_STATUS_LABELS[asset.scan_status]}</Badge>
          {asset.scan_status === 'clean' ? (
            <Button size="sm" variant="secondary" disabled={downloading} onClick={() => onOpen(asset.id)}>
              <ExternalLink aria-hidden="true" className="size-4" />
              Ouvrir
            </Button>
          ) : null}
        </div>
      </div>
      {asset.scan_status === 'rejected' ? (
        <Alert tone="critical">
          Fichier refusé :{' '}
          {REJECTION_REASON_LABELS[asset.rejection_reason ?? ''] ?? 'il ne respecte pas les règles de dépôt'}.
        </Alert>
      ) : null}
      {asset.scan_status === 'pending' ? (
        <p className="text-xs text-muted">Le fichier sera consultable dès que son contrôle sera terminé.</p>
      ) : null}
    </div>
  );
}

function DocumentCard({
  siteId,
  document,
  canWrite,
  downloading,
  onOpen,
}: {
  siteId: string;
  document: Document;
  canWrite: boolean;
  downloading: boolean;
  onOpen: (assetId: string) => void;
}) {
  const [mode, setMode] = useState<'view' | 'edit' | 'version'>('view');
  const archive = useApiMutation(
    (options, status: DocumentUpdate['status']) =>
      api.updateDocument(options, document.id, document.row_version, { status }),
    (tenantId) => [queryKeys.siteRecords(tenantId, siteId, 'documents')],
  );
  const archived = document.status === 'archived';
  const [current, ...previous] = document.versions;

  return (
    <Card className={archived ? 'opacity-70' : undefined}>
      <CardContent className="space-y-3">
        {mode === 'edit' ? (
          <DocumentMetaForm siteId={siteId} document={document} onClose={() => setMode('view')} />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-semibold">{document.title}</p>
            <div className="flex flex-wrap gap-2">
              <Badge>{DOCUMENT_CATEGORY_LABELS[document.category]}</Badge>
              <Badge tone={document.offline_policy === 'never' ? 'neutral' : 'info'}>
                {OFFLINE_POLICY_LABELS[document.offline_policy]}
              </Badge>
              {archived ? <Badge>Archivé</Badge> : null}
            </div>
          </div>
        )}
        {current ? <VersionLine version={current} downloading={downloading} onOpen={onOpen} /> : null}
        {previous.length > 0 ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-info">Versions précédentes ({previous.length})</summary>
            <div className="mt-3 space-y-3 border-l-2 border-border pl-3">
              {previous.map((version) => (
                <VersionLine key={version.id} version={version} downloading={downloading} onOpen={onOpen} />
              ))}
            </div>
          </details>
        ) : null}
        {mode === 'version' ? (
          <NewVersionForm siteId={siteId} document={document} onClose={() => setMode('view')} />
        ) : null}
        {archive.error ? <ApiErrorAlert error={archive.error} /> : null}
        {canWrite && mode === 'view' ? (
          <div className="flex flex-wrap gap-2">
            {!archived ? (
              <Button size="sm" variant="secondary" onClick={() => setMode('version')}>
                Nouvelle version
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setMode('edit')}>
              Modifier
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={archive.isPending}
              onClick={() => archive.mutate(archived ? 'active' : 'archived')}
            >
              {archived ? 'Réactiver' : 'Archiver'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function DocumentsPanel({ siteId }: { siteId: string }) {
  const canWrite = usePermissions().has('site:write');
  const documents = useDocuments(siteId);
  const [adding, setAdding] = useState(false);
  const download = useApiMutation(
    (options, assetId: string) => api.getAssetDownload(options, assetId),
    () => [],
  );
  const open = (assetId: string) => download.mutate(assetId, { onSuccess: (ticket) => openInNewTab(ticket.url) });

  if (documents.isPending) return <LoadingCard lines={3} />;
  if (documents.error) return <ApiErrorAlert error={documents.error} />;

  return (
    <div className="space-y-4">
      {canWrite ? (
        adding ? (
          <Card>
            <CardHeader>
              <CardTitle>Nouveau document</CardTitle>
            </CardHeader>
            <CardContent>
              <NewDocumentForm siteId={siteId} onClose={() => setAdding(false)} />
            </CardContent>
          </Card>
        ) : (
          <Button onClick={() => setAdding(true)}>Déposer un document</Button>
        )
      ) : null}
      {download.error ? <ApiErrorAlert error={download.error} /> : null}
      {documents.data.length === 0 ? <p className="text-sm text-muted">Aucun document pour ce site.</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {documents.data.map((document) => (
          <DocumentCard
            key={`${document.id}-${document.row_version}`}
            siteId={siteId}
            document={document}
            canWrite={canWrite}
            downloading={download.isPending}
            onOpen={open}
          />
        ))}
      </div>
    </div>
  );
}
