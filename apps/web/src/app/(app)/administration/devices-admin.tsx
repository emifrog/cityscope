'use client';

import type { Device, DeviceEnrollmentCode, DeviceList } from '@etare/contracts';
import { isAppVersionBelow, type DeviceState } from '@etare/domain';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Input,
  Table,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  type BadgeProps,
} from '@etare/ui';
import { useState } from 'react';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { DEVICE_STATE_LABELS, SYNC_RECEIPT_STATUS_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useDevices } from '@/lib/queries';
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

function EnrollmentCode({ result, onClose }: { result: DeviceEnrollmentCode; onClose: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Code d’enrôlement de « {result.device.name} »</CardTitle>
        <CardDescription>
          Sur la tablette, connectez-vous à l’application OPS puis saisissez ce code. Il est à usage unique, valable
          jusqu’au {formatDate(result.expires_at)}, et ne sera plus affiché.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          className="font-mono text-3xl font-bold tracking-widest select-all"
          aria-label={`Code ${result.enrollment_code.split('').join(' ')}`}
        >
          {result.enrollment_code}
        </p>
        <Button size="sm" variant="secondary" onClick={onClose}>
          J’ai transmis le code
        </Button>
      </CardContent>
    </Card>
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
  onCode,
}: {
  device: Device;
  currentGeneration: number;
  minAppVersion: string | null;
  keysetSequence: number | null;
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

  return (
    <>
      <TableRow className={revoked ? 'opacity-70' : undefined}>
        <TableCell>
          <p className="font-semibold">{device.name}</p>
          <p className="text-xs text-muted">
            {device.platform === 'android' ? 'Android' : device.platform === 'ios' ? 'iOS' : 'Plateforme inconnue'}
            {device.app_version ? ` · application ${device.app_version}` : ''}
            {device.keyset_sequence !== null ? ` · clés n° ${device.keyset_sequence}` : ''}
            {device.key_algorithm === 'ecdsa-p256'
              ? ' · clé matérielle'
              : device.key_algorithm === 'ed25519'
                ? ' · clé logicielle'
                : ''}
          </p>
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
        </TableCell>
        <TableCell>
          <p className="text-sm">{perimeterLabel(device)}</p>
        </TableCell>
        <TableCell>
          <p className="text-sm">{device.last_user_name ?? device.enrolled_by_name ?? '—'}</p>
          {device.last_seen_at ? (
            <p className="text-xs text-muted">dernier contact {formatDate(device.last_seen_at)}</p>
          ) : null}
        </TableCell>
        <TableCell>
          <p className="text-sm">{formatDate(device.last_sync_at)}</p>
          {device.last_sync_status ? (
            <p className="text-xs text-muted">
              {SYNC_RECEIPT_STATUS_LABELS[device.last_sync_status]}
              {device.last_error_code ? ` (${device.last_error_code})` : ''}
            </p>
          ) : null}
        </TableCell>
        <TableCell>
          <p className="text-sm">{device.installed_sites} site(s)</p>
          {waiting ? <p className="text-xs text-important">{waiting}</p> : null}
        </TableCell>
        <TableCell>
          <Badge tone={STATE_TONES[device.state]}>{DEVICE_STATE_LABELS[device.state]}</Badge>
          {device.state === 'pending' && device.enrollment_expires_at ? (
            <p className="mt-1 text-xs text-muted">code valable jusqu’au {formatDate(device.enrollment_expires_at)}</p>
          ) : null}
          {revoked ? (
            <p className="mt-1 text-xs text-muted">
              le {formatDate(device.revoked_at)} : {device.revocation_reason}
            </p>
          ) : null}
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          {revoked ? null : (
            <div className="flex justify-end gap-1">
              {device.status === 'pending' ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={renew.isPending}
                  onClick={() => renew.mutate(undefined, { onSuccess: onCode })}
                >
                  Nouveau code
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setAssigning((open) => !open)} aria-expanded={assigning}>
                Affectation
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRevoking((open) => !open)} aria-expanded={revoking}>
                Révoquer
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
      {renew.error ? (
        <TableRow>
          <TableCell colSpan={7}>
            <ApiErrorAlert error={renew.error} />
          </TableCell>
        </TableRow>
      ) : null}
      {assigning ? (
        <TableRow>
          <TableCell colSpan={7} className="bg-subtle/40">
            <PerimeterForm device={device} onDone={() => setAssigning(false)} />
          </TableCell>
        </TableRow>
      ) : null}
      {revoking ? (
        <TableRow>
          <TableCell colSpan={7} className="bg-subtle/40">
            <RevokeForm device={device} onDone={() => setRevoking(false)} />
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

function Summary({ list }: { list: DeviceList }) {
  const count = (state: DeviceState) => list.items.filter((device) => device.state === state).length;
  const cells: { label: string; value: number }[] = [
    { label: 'À jour', value: count('up_to_date') },
    { label: 'En retard (plus de 7 jours)', value: count('late') },
    { label: 'En erreur ou jamais synchronisés', value: count('error') + count('never_synced') },
    { label: 'Révoqués', value: count('revoked') },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs text-muted">{cell.label}</dt>
          <dd className="text-2xl font-bold">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Terminals of the SIS: enrollment codes, synchronization and revocation (ADMIN-02, OFF-04). */
export function DevicesAdmin() {
  const devices = useDevices();
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState<DeviceEnrollmentCode | null>(null);

  return (
    <div className="space-y-4">
      {code ? <EnrollmentCode result={code} onClose={() => setCode(null)} /> : null}
      {!creating && !code && devices.data ? (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>Ajouter un terminal</Button>
        </div>
      ) : null}
      {creating ? (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter un terminal</CardTitle>
            <CardDescription>
              Un code d’enrôlement à usage unique, valable 24 heures, est remis à la personne qui installe la tablette.
              La tablette génère sa propre clé : aucun secret ne transite par ce code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <CreateDevice
              onCreated={(result) => {
                setCode(result);
                setCreating(false);
              }}
            />
            <Button size="sm" variant="secondary" onClick={() => setCreating(false)}>
              Annuler
            </Button>
          </CardContent>
        </Card>
      ) : null}
      {devices.isPending ? <LoadingCard lines={5} /> : null}
      {devices.error ? <ApiErrorAlert error={devices.error} /> : null}
      {devices.data ? (
        <>
          <Summary list={devices.data} />
          {devices.data.undistributed_publications > 0 ? (
            <Alert tone="info">
              {devices.data.undistributed_publications} version(s) publiée(s) ne sont pas distribuées aux terminaux :
              publiées avant la signature des paquets (republiez le dossier), ou site sensible.
            </Alert>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>Terminaux ({devices.data.items.length})</CardTitle>
              <CardDescription>
                Génération du catalogue du SIS : {devices.data.current_generation}. Un terminal reçoit les nouvelles
                versions à sa prochaine synchronisation ; « à jour » signifie un accusé d’installation de moins de 7
                jours.
                {devices.data.min_app_version
                  ? ` Version minimale de l’application exigée : ${devices.data.min_app_version}.`
                  : ''}
                {devices.data.keyset_sequence !== null
                  ? ` Jeu de clés de signature servi : n° ${devices.data.keyset_sequence}.`
                  : ''}
              </CardDescription>
            </CardHeader>
            {devices.data.items.length === 0 ? (
              <CardContent>
                <p className="text-sm text-muted">Aucun terminal : ajoutez-en un pour distribuer les ETARE publiés.</p>
              </CardContent>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Terminal</TableHeaderCell>
                    <TableHeaderCell>Affectation</TableHeaderCell>
                    <TableHeaderCell>Utilisateur</TableHeaderCell>
                    <TableHeaderCell>Dernière synchronisation</TableHeaderCell>
                    <TableHeaderCell>Paquets</TableHeaderCell>
                    <TableHeaderCell>État</TableHeaderCell>
                    <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <tbody>
                  {devices.data.items.map((device) => (
                    <DeviceRow
                      key={`${device.id}-${device.row_version}`}
                      device={device}
                      currentGeneration={devices.data.current_generation}
                      minAppVersion={devices.data.min_app_version}
                      keysetSequence={devices.data.keyset_sequence}
                      onCode={setCode}
                    />
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
          <TerminalPolicyCard />
        </>
      ) : null}
    </div>
  );
}
