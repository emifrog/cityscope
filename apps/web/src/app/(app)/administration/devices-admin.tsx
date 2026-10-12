'use client';

import type { Device, DeviceEnrollmentCode, DeviceList } from '@etare/contracts';
import { isAppVersionBelow, type DeviceState } from '@etare/domain';
import { Alert, Badge, Button, Card, CardContent, Field, Input, cn, type BadgeProps } from '@etare/ui';
import { KeyRound, Plus, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { DEVICE_STATE_LABELS, SYNC_RECEIPT_STATUS_LABELS } from '@/components/labels';
import { SectionCard } from '@/components/section-card';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useDevices } from '@/lib/queries';
import { agoLabel } from '@/lib/relative-time';
import { SectorChoice, type SectorSelection } from './sector-choice';
import { TerminalPolicyCard } from './terminal-policy-card';

const dateTime = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' });
const formatDate = (value: string | null) => (value ? dateTime.format(new Date(value)) : '—');

const STATE_TONES: Readonly<Record<DeviceState, BadgeProps['tone']>> = {
  pending: 'info',
  never_synced: 'important',
  up_to_date: 'success',
  late: 'important',
  error: 'critical',
  revoked: 'neutral',
};

const STATE_BOXES: Readonly<Record<DeviceState, string>> = {
  pending: 'bg-info-soft text-info',
  never_synced: 'bg-important-soft text-important',
  up_to_date: 'bg-success-soft text-success',
  late: 'bg-important-soft text-important',
  error: 'bg-critical-soft text-critical',
  revoked: 'bg-subtle text-muted',
};

function EnrollmentCode({ result, onClose }: { result: DeviceEnrollmentCode; onClose: () => void }) {
  return (
    <SectionCard
      icon={KeyRound}
      title={`Code d’enrôlement de « ${result.device.name} »`}
      description={`Sur la tablette, connectez-vous à l’application OPS puis saisissez ce code. Il est à usage unique, valable jusqu’au ${formatDate(result.expires_at)}, et ne sera plus affiché.`}
      contentClassName="space-y-4 px-5 py-4"
    >
      <p
        className="font-mono text-3xl font-bold tracking-widest select-all"
        aria-label={`Code ${result.enrollment_code.split('').join(' ')}`}
      >
        {result.enrollment_code}
      </p>
      <Button size="sm" variant="secondary" onClick={onClose}>
        J’ai transmis le code
      </Button>
    </SectionCard>
  );
}

const WHOLE_SIS: SectorSelection = { whole: true, sectorIds: [] };

/** "Tout le SIS" or the names of the sectors of a terminal (maquette, screen 11). */
function perimeterLabel(device: Device): string {
  return device.perimeter.scope === 'tenant'
    ? 'Tout le SIS'
    : device.perimeter.sectors.map((sector) => sector.name).join(', ') || 'Aucun secteur actif';
}

function CreateDevice({ onCreated }: { onCreated: (result: DeviceEnrollmentCode) => void }) {
  const [name, setName] = useState('');
  const [perimeter, setPerimeter] = useState<SectorSelection>(WHOLE_SIS);
  const create = useApiMutation(
    (options, input: { name: string; sector_ids: string[] }) => api.createDevice(options, input),
    (tenantId) => [queryKeys.devices(tenantId), queryKeys.sectors(tenantId)],
  );
  const incomplete = !perimeter.whole && perimeter.sectorIds.length === 0;
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        create.mutate(
          { name: name.trim(), sector_ids: perimeter.whole ? [] : [...perimeter.sectorIds] },
          { onSuccess: (result) => onCreated(result) },
        );
      }}
    >
      {create.error ? <ApiErrorAlert error={create.error} /> : null}
      <Field label="Nom du terminal" htmlFor="device-name" hint="Ex. TABLETTE FPT01 — CIS Nice Centre">
        <Input id="device-name" value={name} maxLength={100} onChange={(event) => setName(event.target.value)} />
      </Field>
      <SectorChoice
        name="device-perimeter-new"
        wholeLabel="Tout le SIS"
        limitedLabel="Des secteurs"
        value={perimeter}
        onChange={setPerimeter}
      />
      <Button type="submit" size="sm" disabled={create.isPending || name.trim().length === 0 || incomplete}>
        {create.isPending ? 'Création…' : 'Créer et obtenir un code'}
      </Button>
    </form>
  );
}

/** Assigns the terminal to sectors or to the whole SIS; it follows at its next contact. */
function PerimeterForm({ device, onDone }: { device: Device; onDone: () => void }) {
  const [perimeter, setPerimeter] = useState<SectorSelection>({
    whole: device.perimeter.scope === 'tenant',
    sectorIds: device.perimeter.sectors.map((sector) => sector.id),
  });
  const save = useApiMutation(
    (options, sectorIds: string[]) =>
      api.setDevicePerimeter(options, device.id, device.row_version, { sector_ids: sectorIds }),
    (tenantId) => [queryKeys.devices(tenantId), queryKeys.sectors(tenantId)],
  );
  const incomplete = !perimeter.whole && perimeter.sectorIds.length === 0;
  return (
    <form
      noValidate
      className="max-w-2xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate(perimeter.whole ? [] : [...perimeter.sectorIds], { onSuccess: onDone });
      }}
    >
      {save.error ? <ApiErrorAlert error={save.error} /> : null}
      <SectorChoice
        name={`device-perimeter-${device.id}`}
        wholeLabel="Tout le SIS"
        limitedLabel="Des secteurs"
        value={perimeter}
        onChange={setPerimeter}
      />
      <p className="text-xs text-muted">
        La tablette reçoit les sites communs à son affectation et au périmètre de l’agent connecté ; ce qui en sort est
        retiré à sa prochaine synchronisation, avec le motif « retiré de votre périmètre ».
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || incomplete}>
          {save.isPending ? 'Enregistrement…' : 'Enregistrer l’affectation'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function RevokeForm({ device, onDone }: { device: Device; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const revoke = useApiMutation(
    (options, input: { reason: string }) => api.revokeDevice(options, device.id, device.row_version, input),
    (tenantId) => [queryKeys.devices(tenantId)],
  );
  return (
    <form
      noValidate
      className="max-w-2xl space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        revoke.mutate({ reason: reason.trim() }, { onSuccess: onDone });
      }}
    >
      {revoke.error ? <ApiErrorAlert error={revoke.error} /> : null}
      <Alert tone="important">
        La révocation est définitive : le serveur refuse immédiatement ce terminal, et l’application efface ses données
        au prochain contact. Hors réseau, les données restent consultables jusqu’à l’expiration de l’autorisation (7
        jours au plus).
      </Alert>
      <Field label="Motif" htmlFor={`revoke-${device.id}`} hint="Perte, vol, fin de vie, réaffectation…">
        <Input id={`revoke-${device.id}`} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="danger" disabled={revoke.isPending || reason.trim().length < 3}>
          {revoke.isPending ? 'Révocation…' : 'Révoquer le terminal'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function updatesWaiting(device: Device, current: number): string | null {
  if (device.status !== 'active' || device.installed_generation === null) return null;
  return device.installed_generation < current ? 'Mises à jour publiées depuis' : null;
}

/** A terminal that has not met the last rotation of the signing keys (SEC-04). */
function keysetBehind(device: Device, served: number | null): boolean {
  return (
    device.status === 'active' && served !== null && device.keyset_sequence !== null && device.keyset_sequence < served
  );
}

function DeviceRow({
  device,
  currentGeneration,
  minAppVersion,
  keysetSequence,
  now,
  onCode,
}: {
  device: Device;
  currentGeneration: number;
  minAppVersion: string | null;
  keysetSequence: number | null;
  now: number;
  onCode: (result: DeviceEnrollmentCode) => void;
}) {
  const [revoking, setRevoking] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const renew = useApiMutation(
    (options) => api.renewDeviceEnrollment(options, device.id, device.row_version),
    (tenantId) => [queryKeys.devices(tenantId)],
  );
  const waiting = updatesWaiting(device, currentGeneration);
  const revoked = device.status === 'revoked';
  const outdated = !revoked && isAppVersionBelow(device.app_version, minAppVersion);
  const platform =
    device.platform === 'android' ? 'Android' : device.platform === 'ios' ? 'iOS' : 'Plateforme inconnue';

  return (
    <li className={cn('px-5 py-4', revoked && 'opacity-70')}>
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-start">
        <span
          aria-hidden="true"
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-md', STATE_BOXES[device.state])}
        >
          <Smartphone className="size-5" />
        </span>
        <div className="min-w-0 space-y-1.5">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{device.name}</span>
            <Badge tone={STATE_TONES[device.state]}>{DEVICE_STATE_LABELS[device.state]}</Badge>
            <Badge>{perimeterLabel(device)}</Badge>
          </p>
          <p className="text-xs text-muted">
            {platform}
            {device.app_version ? ` · application ${device.app_version}` : ''}
            {device.keyset_sequence !== null ? ` · clés n° ${device.keyset_sequence}` : ''}
            {device.key_algorithm === 'ecdsa-p256'
              ? ' · clé matérielle'
              : device.key_algorithm === 'ed25519'
                ? ' · clé logicielle'
                : ''}
            {(device.last_user_name ?? device.enrolled_by_name)
              ? ` · ${device.last_user_name ?? device.enrolled_by_name}`
              : ''}
          </p>
          <p className="text-xs text-muted">
            {device.last_sync_at
              ? `Synchronisée ${agoLabel(device.last_sync_at, now)} (${formatDate(device.last_sync_at)})`
              : 'Jamais synchronisée'}
            {device.last_sync_status
              ? ` · ${SYNC_RECEIPT_STATUS_LABELS[device.last_sync_status].toLowerCase()}${
                  device.last_error_code ? ` (${device.last_error_code})` : ''
                }`
              : ''}
            {device.last_seen_at ? ` · dernier contact ${agoLabel(device.last_seen_at, now)}` : ''}
            {` · ${device.installed_sites} site${device.installed_sites > 1 ? 's' : ''} installé${device.installed_sites > 1 ? 's' : ''}`}
          </p>
          {waiting ? <p className="text-xs font-semibold text-important">{waiting}</p> : null}
          {keysetBehind(device, keysetSequence) ? (
            <p className="text-xs font-semibold text-important">
              Jeu de clés n° {keysetSequence} pas encore reçu : il le sera au prochain contact
            </p>
          ) : null}
          {outdated ? (
            <p className="text-xs font-semibold text-important">
              Application à mettre à jour (version {minAppVersion} exigée) : aucune nouvelle version n’est installée
            </p>
          ) : null}
          {device.state === 'pending' && device.enrollment_expires_at ? (
            <p className="text-xs text-muted">Code valable jusqu’au {formatDate(device.enrollment_expires_at)}</p>
          ) : null}
          {revoked ? (
            <p className="text-xs text-muted">
              Révoquée le {formatDate(device.revoked_at)} : {device.revocation_reason}
            </p>
          ) : null}
          {renew.error ? <ApiErrorAlert error={renew.error} /> : null}
        </div>
        {revoked ? null : (
          <div className="flex flex-wrap gap-1 md:justify-end">
            {device.status === 'pending' ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={renew.isPending}
                onClick={() => renew.mutate(undefined, { onSuccess: onCode })}
              >
                Nouveau code
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAssigning((open) => !open)}
              aria-expanded={assigning}
            >
              Affectation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRevoking((open) => !open)} aria-expanded={revoking}>
              Révoquer
            </Button>
          </div>
        )}
      </div>
      {assigning ? (
        <div className="mt-3 rounded-md bg-subtle/60 p-4">
          <PerimeterForm device={device} onDone={() => setAssigning(false)} />
        </div>
      ) : null}
      {revoking ? (
        <div className="mt-3 rounded-md bg-subtle/60 p-4">
          <RevokeForm device={device} onDone={() => setRevoking(false)} />
        </div>
      ) : null}
    </li>
  );
}

function Summary({ list }: { list: DeviceList }) {
  const count = (state: DeviceState) => list.items.filter((device) => device.state === state).length;
  const cells: { label: string; value: number; tone: 'success' | 'important' | 'critical' | 'neutral' }[] = [
    { label: 'À jour', value: count('up_to_date'), tone: 'success' },
    { label: 'En retard (plus de 7 jours)', value: count('late'), tone: 'important' },
    { label: 'En erreur ou jamais synchronisés', value: count('error') + count('never_synced'), tone: 'critical' },
    { label: 'Révoqués', value: count('revoked'), tone: 'neutral' },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cells.map((cell) => (
        <Card key={cell.label}>
          <CardContent className="px-4 py-3">
            <dt className="text-xs text-muted">{cell.label}</dt>
            <dd
              className={cn(
                'text-2xl font-bold',
                cell.value > 0 && cell.tone === 'important' && 'text-important',
                cell.value > 0 && cell.tone === 'critical' && 'text-critical',
              )}
            >
              {cell.value}
            </dd>
          </CardContent>
        </Card>
      ))}
    </dl>
  );
}

const enrolledLabel = (count: number) => (count > 1 ? `${count} terminaux enrôlés` : `${count} terminal enrôlé`);

/** Terminals of the SIS: enrollment codes, synchronization and revocation (ADMIN-02, OFF-04). */
export function DevicesAdmin() {
  const devices = useDevices();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState<DeviceEnrollmentCode | null>(null);
  // One instant per mount: the relative dates stay coherent.
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-4">
      {code ? <EnrollmentCode result={code} onClose={() => setCode(null)} /> : null}
      {devices.data ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="info" className="px-3 py-1 text-sm">
            {enrolledLabel(devices.data.items.filter((device) => device.status !== 'revoked').length)}
          </Badge>
          {!creating && !code ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Ajouter un terminal
            </Button>
          ) : null}
        </div>
      ) : null}
      {creating ? (
        <SectionCard
          icon={Smartphone}
          title="Ajouter un terminal"
          description="Un code d’enrôlement à usage unique, valable 24 heures, est remis à la personne qui installe la tablette. La tablette génère sa propre clé : aucun secret ne transite par ce code."
          contentClassName="space-y-3 px-5 py-4"
        >
          <CreateDevice
            onCreated={(result) => {
              setCode(result);
              setCreating(false);
            }}
          />
          <Button size="sm" variant="secondary" onClick={() => setCreating(false)}>
            Annuler
          </Button>
        </SectionCard>
      ) : null}
      {devices.isPending ? <LoadingCard lines={5} /> : null}
      {devices.error ? <ApiErrorAlert error={devices.error} /> : null}
      {devices.data ? (
        <>
          <Summary list={devices.data} />
          <p className="text-xs text-muted">
            Génération du catalogue du SIS : {devices.data.current_generation}
            {devices.data.min_app_version ? ` · application ${devices.data.min_app_version} au minimum` : ''}
            {devices.data.keyset_sequence !== null ? ` · jeu de clés servi n° ${devices.data.keyset_sequence}` : ''}. «
            À jour » : un accusé d’installation de moins de 7 jours.
          </p>
          {devices.data.undistributed_publications > 0 ? (
            <Alert tone="info">
              {devices.data.undistributed_publications} version(s) publiée(s) ne sont pas distribuées aux terminaux :
              publiées avant la signature des paquets (republiez le dossier), ou site sensible.
            </Alert>
          ) : null}
          {devices.data.items.length === 0 ? (
            <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span
                aria-hidden="true"
                className="flex size-12 items-center justify-center rounded-full bg-subtle text-brand-navy"
              >
                <Smartphone className="size-6" />
              </span>
              <p className="font-semibold text-foreground">Aucun terminal enrôlé.</p>
              <p className="text-sm text-muted">Ajoutez-en un pour distribuer les ETARE publiés aux intervenants.</p>
            </Card>
          ) : (
            <Card>
              <ul className="divide-y divide-border" aria-label="Terminaux du SIS">
                {devices.data.items.map((device) => (
                  <DeviceRow
                    key={`${device.id}-${device.row_version}`}
                    device={device}
                    currentGeneration={devices.data.current_generation}
                    minAppVersion={devices.data.min_app_version}
                    keysetSequence={devices.data.keyset_sequence}
                    now={now}
                    onCode={setCode}
                  />
                ))}
              </ul>
            </Card>
          )}
          <TerminalPolicyCard />
        </>
      ) : null}
    </div>
  );
}
