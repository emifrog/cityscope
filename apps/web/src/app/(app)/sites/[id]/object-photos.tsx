'use client';

import {
  MAX_PHOTO_BYTES,
  PHOTO_MIME_TYPES,
  type FileDeclaration,
  type ObjectPhoto,
  type ObjectPhotoUpload,
} from '@etare/contracts';
import { Alert, Badge, Button, Field, Input } from '@etare/ui';
import { ImagePlus } from 'lucide-react';
import { useRef, useState } from 'react';
import { ApiErrorAlert } from '@/components/feedback';
import { REJECTION_REASON_LABELS, SCAN_STATUS_LABELS } from '@/components/labels';
import { ApiRequestError, api, type ApiCallOptions } from '@/lib/api-client';
import { queryKeys, useApiMutation, useAssetUrl, useSiteFileUpload, useSiteObjects } from '@/lib/queries';

const STEP_LABELS = {
  reading: 'Calcul de l’empreinte…',
  declaring: 'Déclaration de la photo…',
  sending: 'Envoi de la photo…',
  confirming: 'Demande de contrôle…',
} as const;

/** Why a chosen file cannot be a photo (checked again by the API and the worker), or null. */
export function photoRefusal(file: Pick<FileDeclaration, 'mime_type' | 'size_bytes'>): string | null {
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.mime_type)) {
    return 'Une photo est une image PNG, JPEG ou WebP.';
  }
  if (file.size_bytes > MAX_PHOTO_BYTES) return `Photo trop volumineuse (maximum ${MAX_PHOTO_BYTES / 1024 / 1024} Mo).`;
  return null;
}

function PhotoTile({ siteId, photo }: { siteId: string; photo: ObjectPhoto }) {
  const clean = photo.asset.scan_status === 'clean';
  const image = useAssetUrl(clean ? photo.asset.id : null);
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [confirming, setConfirming] = useState(false);
  const update = useApiMutation(
    (options, patch: { caption?: string | null; status?: 'archived' }) =>
      api.updateObjectPhoto(options, photo.id, photo.row_version, patch),
    (tenantId) => [
      queryKeys.siteRecords(tenantId, siteId, 'objects'),
      queryKeys.siteRecords(tenantId, siteId, 'etare-preview'),
    ],
  );
  const changed = (caption.trim() || null) !== photo.caption;

  return (
    <li className="space-y-2 rounded-md border border-border p-2">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded bg-subtle">
        {clean && image.data ? (
          // Short-lived signed URL of a checked file: next/image cannot optimize it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image.data.url} alt={photo.caption ?? photo.asset.filename} className="size-full object-cover" />
        ) : (
          <Badge tone={photo.asset.scan_status === 'rejected' ? 'critical' : 'info'}>
            {SCAN_STATUS_LABELS[photo.asset.scan_status]}
          </Badge>
        )}
      </div>
      {photo.asset.scan_status === 'rejected' ? (
        <p className="text-xs text-critical">
          Refusée : {REJECTION_REASON_LABELS[photo.asset.rejection_reason ?? ''] ?? 'fichier non conforme'}.
        </p>
      ) : null}
      <Input
        aria-label={`Légende de ${photo.asset.filename}`}
        maxLength={200}
        placeholder="Légende"
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
      />
      {update.error ? <ApiErrorAlert error={update.error} /> : null}
      <div className="flex flex-wrap gap-1">
        {changed ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={update.isPending}
            onClick={() => update.mutate({ caption: caption.trim() || null })}
          >
            Enregistrer
          </Button>
        ) : null}
        {confirming ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={update.isPending}
              onClick={() => update.mutate({ status: 'archived' })}
            >
              Confirmer le retrait
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>
            Retirer
          </Button>
        )}
      </div>
    </li>
  );
}

/**
 * Photos of an object (PLAN-05). Each photo follows the controlled upload
 * chain; it reaches the ETARE snapshot and the tablets once checked. A photo
 * is archived (withdrawn), never deleted.
 */
export function ObjectPhotos({ siteId, objectId }: { siteId: string; objectId: string }) {
  const objects = useSiteObjects(siteId);
  const photos = objects.data?.find((object) => object.id === objectId)?.photos ?? [];
  const upload = useSiteFileUpload<ObjectPhotoUpload>(siteId, 'objects', ['etare-preview']);
  const input = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState('');

  function send(file: File) {
    upload.mutate(
      {
        file,
        declare: (options: ApiCallOptions, declaration: FileDeclaration) => {
          const refusal = photoRefusal(declaration);
          if (refusal) throw new ApiRequestError(400, 'VALIDATION_FAILED', refusal, null);
          return api.createObjectPhoto(options, objectId, {
            ...(caption.trim() ? { caption: caption.trim() } : {}),
            file: declaration,
          });
        },
      },
      { onSuccess: () => setCaption('') },
    );
  }

  return (
    <section aria-labelledby={`photos-${objectId}`} className="space-y-3 border-t border-border pt-3">
      <h3 id={`photos-${objectId}`} className="text-sm font-semibold">
        Photos ({photos.length})
      </h3>
      {photos.length > 0 ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-2">
          {photos.map((photo) => (
            <PhotoTile key={`${photo.id}-${photo.row_version}`} siteId={siteId} photo={photo} />
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted">Aucune photo : elles aident les intervenants à reconnaître le point.</p>
      )}
      {upload.error ? <ApiErrorAlert error={upload.error} /> : null}
      {upload.step ? <Alert tone="info">{STEP_LABELS[upload.step]}</Alert> : null}
      <Field label="Légende de la nouvelle photo" htmlFor={`photo-caption-${objectId}`}>
        <Input
          id={`photo-caption-${objectId}`}
          maxLength={200}
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
        />
      </Field>
      <input
        ref={input}
        type="file"
        accept={PHOTO_MIME_TYPES.join(',')}
        className="sr-only"
        aria-label="Choisir une photo"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) send(file);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <ImagePlus aria-hidden="true" className="size-4" />
        Ajouter une photo
      </Button>
      <p className="text-xs text-muted">
        PNG, JPEG ou WebP, 15 Mo au plus. La photo est contrôlée avant d’être diffusée.
      </p>
    </section>
  );
}
