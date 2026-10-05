'use client';

import type { Member, MemberInvitation, MemberInvite, MemberUpdate } from '@etare/contracts';
import { TENANT_WIDE_ROLES, type TenantWideRole } from '@etare/domain';
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
} from '@etare/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { ApiErrorAlert, LoadingCard } from '@/components/feedback';
import { MEMBERSHIP_STATUS_LABELS, ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/components/labels';
import { api } from '@/lib/api-client';
import { SitePicker } from '@/components/site-picker';
import { queryKeys, useApiMutation, useMembers } from '@/lib/queries';
import { SectorChoice, type SectorSelection } from './sector-choice';

const signInFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' });

/** Invitation accepted or not, last sign-in and second factor (ADR-022). */
function AccessCell({ member }: { member: Member }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {member.last_sign_in_at === null ? (
        <Badge tone="important">Invitation en attente</Badge>
      ) : (
        <span className="text-xs text-muted">
          Dernière connexion le {signInFormat.format(new Date(member.last_sign_in_at))}
        </span>
      )}
      {member.second_factor ? (
        <Badge tone="success">Double authentification</Badge>
      ) : (
        <Badge tone="neutral">Sans double authentification</Badge>
      )}
    </div>
  );
}

const dayFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
/** End of a habilitation proposed by default: one year, the longest allowed (ADR-025). */
const inOneYear = () => new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

/** Habilitation to the "restricted" sites, dated (PER-02). */
function SensitiveAccessBadge({ member }: { member: Member }) {
  if (!member.sensitive_access) return null;
  const scope =
    member.sensitive_access.sectors.length === 0
      ? 'tout le SIS'
      : member.sensitive_access.sectors.map((sector) => sector.name).join(', ');
  return (
    <Badge tone="important">
      Sites sensibles ({scope}) jusqu’au {dayFormat.format(new Date(member.sensitive_access.valid_until))}
    </Badge>
  );
}

function SensitiveAccessForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const [sectors, setSectors] = useState<SectorSelection>({
    whole: (member.sensitive_access?.sectors.length ?? 0) === 0,
    sectorIds: member.sensitive_access?.sectors.map((sector) => sector.id) ?? [],
  });
  const [until, setUntil] = useState(member.sensitive_access?.valid_until.slice(0, 10) ?? inOneYear());
  const save = useApiMutation(
    (options, input: { sector_ids: string[]; valid_until: string | null }) =>
      api.setMemberSensitiveAccess(options, member.id, member.row_version, input),
    (tenantId) => [queryKeys.members(tenantId)],
  );
  const incomplete = (!sectors.whole && sectors.sectorIds.length === 0) || until.length !== 10;
  return (
    <div className="max-w-2xl space-y-3">
      {save.error ? <ApiErrorAlert error={save.error} /> : null}
      <p className="text-sm">
        L’habilitation est nominative et datée (douze mois au plus, renouvelable). Elle permet d’ouvrir à la demande,
        sur une tablette, les sites « restreints » de son périmètre ; les sites « élevés » ne vont jamais sur tablette.
      </p>
      <SectorChoice
        name={`sensitive-${member.id}`}
        wholeLabel="Tous les sites restreints du SIS"
        limitedLabel="Les sites restreints de certains secteurs"
        value={sectors}
        onChange={setSectors}
      />
      <Field label="Jusqu’au" htmlFor={`sensitive-until-${member.id}`}>
        <Input
          id={`sensitive-until-${member.id}`}
          type="date"
          value={until}
          max={inOneYear()}
          onChange={(event) => setUntil(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={save.isPending || incomplete}
          onClick={() =>
            save.mutate(
              {
                sector_ids: sectors.whole ? [] : [...sectors.sectorIds],
                // End of the chosen day, in the time of the administrator.
                valid_until: new Date(`${until}T23:59:59`).toISOString(),
              },
              { onSuccess: onDone },
            )
          }
        >
          {save.isPending ? 'Enregistrement…' : member.sensitive_access ? 'Renouveler' : 'Habiliter'}
        </Button>
        {member.sensitive_access ? (
          <Button
            size="sm"
            variant="danger"
            disabled={save.isPending}
            onClick={() => save.mutate({ sector_ids: [], valid_until: null }, { onSuccess: onDone })}
          >
            Retirer l’habilitation
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

/** "Tout le SIS" or the sectors and sites the roles are limited to (PER-01). */
function PerimeterBadge({ member }: { member: Member }) {
  if (member.roles.length === 0) return null;
  if (!member.perimeter) return <Badge tone="neutral">Tout le SIS</Badge>;
  const parts = [
    ...member.perimeter.sectors.map((sector) => sector.name),
    ...(member.perimeter.sites.length > 0 ? [`${member.perimeter.sites.length} site(s)`] : []),
  ];
  return <Badge tone="info">Limité à : {parts.join(', ')}</Badge>;
}

interface PerimeterValue {
  readonly sectors: SectorSelection;
  readonly sites: ReadonlyMap<string, string>;
}

const WHOLE_PERIMETER: PerimeterValue = { sectors: { whole: true, sectorIds: [] }, sites: new Map() };

const perimeterInput = (value: PerimeterValue) =>
  value.sectors.whole
    ? { sector_ids: [], site_ids: [] }
    : { sector_ids: [...value.sectors.sectorIds], site_ids: [...value.sites.keys()] };

const perimeterIncomplete = (value: PerimeterValue) =>
  !value.sectors.whole && value.sectors.sectorIds.length === 0 && value.sites.size === 0;

/** Whole SIS, or sectors and sites: every role of the member shares that perimeter. */
function PerimeterChoice({
  name,
  value,
  onChange,
  administrator,
}: {
  name: string;
  value: PerimeterValue;
  onChange: (next: PerimeterValue) => void;
  administrator: boolean;
}) {
  if (administrator) {
    return (
      <p className="text-sm text-muted">
        L’administration du SIS s’exerce sur tout le SIS : retirez ce rôle pour limiter la personne à des secteurs.
      </p>
    );
  }
  return (
    <SectorChoice
      name={name}
      wholeLabel="Tout le SIS"
      limitedLabel="Des secteurs ou des sites"
      value={value.sectors}
      onChange={(sectors) => onChange({ ...value, sectors })}
    >
      <SitePicker
        legend="Sites ajoutés un à un"
        selected={value.sites}
        onChange={(sites) => onChange({ ...value, sites })}
      />
    </SectorChoice>
  );
}

function MemberPerimeterForm({ member, onDone }: { member: Member; onDone: () => void }) {
  const [value, setValue] = useState<PerimeterValue>(
    member.perimeter
      ? {
          sectors: { whole: false, sectorIds: member.perimeter.sectors.map((sector) => sector.id) },
          sites: new Map(member.perimeter.sites.map((site) => [site.id, site.name])),
        }
      : WHOLE_PERIMETER,
  );
  const save = useApiMutation(
    (options, input: { sector_ids: string[]; site_ids: string[] }) =>
      api.setMemberPerimeter(options, member.id, member.row_version, input),
    (tenantId) => [queryKeys.members(tenantId), queryKeys.sectors(tenantId)],
  );
  return (
    <div className="max-w-2xl space-y-3">
      {save.error ? <ApiErrorAlert error={save.error} /> : null}
      <PerimeterChoice
        name={`perimeter-${member.id}`}
        value={value}
        onChange={setValue}
        administrator={member.roles.includes('SIS_ADMIN')}
      />
      <p className="text-xs text-muted">
        Tous les rôles de la personne suivent ce périmètre, au back-office comme sur les tablettes ; ce qui en sort est
        retiré des tablettes à leur prochaine synchronisation.
      </p>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={save.isPending || perimeterIncomplete(value) || member.roles.includes('SIS_ADMIN')}
          onClick={() => save.mutate(perimeterInput(value), { onSuccess: onDone })}
        >
          {save.isPending ? 'Enregistrement…' : 'Enregistrer le périmètre'}
        </Button>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

const inviteForm = z.object({
  email: z.email('Adresse e-mail invalide.').max(254),
  display_name: z.string().trim().max(200),
  roles: z.array(z.enum(TENANT_WIDE_ROLES)).min(1, 'Choisissez au moins un rôle.'),
});
type InviteValues = z.infer<typeof inviteForm>;

function RoleChoices({
  name,
  selected,
  onChange,
}: {
  name: string;
  selected: readonly TenantWideRole[];
  onChange: (roles: TenantWideRole[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Rôles</legend>
      {TENANT_WIDE_ROLES.map((role) => {
        const id = `${name}-${role}`;
        return (
          <label key={role} htmlFor={id} className="flex items-start gap-3 rounded-md p-2 hover:bg-subtle">
            <input
              id={id}
              type="checkbox"
              className="mt-1 size-4 accent-brand-accent"
              checked={selected.includes(role)}
              onChange={(event) =>
                onChange(event.target.checked ? [...selected, role] : selected.filter((current) => current !== role))
              }
            />
            <span>
              <span className="block text-sm font-semibold">{ROLE_LABELS[role]}</span>
              <span className="block text-xs text-muted">{ROLE_DESCRIPTIONS[role]}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function InviteForm({ onClose }: { onClose: (result: MemberInvitation | null) => void }) {
  const [perimeter, setPerimeter] = useState<PerimeterValue>(WHOLE_PERIMETER);
  const invite = useApiMutation(
    (options, input: MemberInvite) => api.inviteMember(options, input),
    (tenantId) => [queryKeys.members(tenantId)],
  );
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<InviteValues>({
    resolver: zodResolver(inviteForm),
    defaultValues: { email: '', display_name: '', roles: ['READER'] },
  });
  const selectedRoles = useWatch({ control, name: 'roles' });

  return (
    <form
      noValidate
      className="grid gap-4 md:grid-cols-2"
      onSubmit={handleSubmit((values) =>
        invite.mutate(
          {
            email: values.email.trim(),
            display_name: values.display_name.trim() || null,
            roles: values.roles,
            ...(values.roles.includes('SIS_ADMIN') ? {} : perimeterInput(perimeter)),
          },
          { onSuccess: (result) => onClose(result) },
        ),
      )}
    >
      {invite.error ? (
        <div className="md:col-span-2">
          <ApiErrorAlert error={invite.error} />
        </div>
      ) : null}
      <Field label="Adresse e-mail professionnelle" htmlFor="invite-email" error={errors.email?.message}>
        <Input id="invite-email" type="email" autoComplete="off" {...register('email')} />
      </Field>
      <Field label="Nom affiché" htmlFor="invite-name" hint="Facultatif : prénom et nom, grade…">
        <Input id="invite-name" {...register('display_name')} />
      </Field>
      <div className="md:col-span-2">
        <p className="mb-1 text-sm font-semibold">Rôles dans le SIS</p>
        <RoleChoices
          name="invite-role"
          selected={selectedRoles}
          onChange={(roles) => setValue('roles', roles, { shouldValidate: true })}
        />
        {errors.roles?.message ? <p className="mt-1 text-sm text-critical">{errors.roles.message}</p> : null}
        <p className="mt-2 text-xs text-muted">
          Les exploitants sont rattachés à leurs sites depuis le portail exploitant (à venir).
        </p>
      </div>
      <div className="md:col-span-2">
        <PerimeterChoice
          name="invite-perimeter"
          value={perimeter}
          onChange={setPerimeter}
          administrator={selectedRoles.includes('SIS_ADMIN')}
        />
      </div>
      <div className="flex gap-2 md:col-span-2">
        <Button
          type="submit"
          size="sm"
          disabled={invite.isPending || (!selectedRoles.includes('SIS_ADMIN') && perimeterIncomplete(perimeter))}
        >
          {invite.isPending ? 'Envoi…' : 'Inviter'}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => onClose(null)}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function MemberRow({ member }: { member: Member }) {
  const [editing, setEditing] = useState(false);
  const [limiting, setLimiting] = useState(false);
  const [habilitating, setHabilitating] = useState(false);
  const [roles, setRoles] = useState<TenantWideRole[]>(() =>
    member.roles.filter((role): role is TenantWideRole => (TENANT_WIDE_ROLES as readonly string[]).includes(role)),
  );
  const update = useApiMutation(
    (options, patch: MemberUpdate) => api.updateMember(options, member.id, member.row_version, patch),
    (tenantId) => [queryKeys.members(tenantId)],
  );
  const reset = useApiMutation(
    (options, _: void) => api.resetMemberSecondFactor(options, member.id, member.row_version),
    (tenantId) => [queryKeys.members(tenantId)],
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const suspended = member.status !== 'active';

  return (
    <>
      <TableRow className={suspended ? 'opacity-70' : undefined}>
        <TableCell>
          <p className="font-semibold">
            {member.display_name ?? member.email}
            {member.is_self ? (
              <Badge tone="info" className="ml-2">
                Vous
              </Badge>
            ) : null}
          </p>
          {member.display_name ? <p className="text-xs text-muted">{member.email}</p> : null}
        </TableCell>
        <TableCell>
          <div className="flex flex-wrap gap-1">
            {member.roles.map((role) => (
              <Badge key={role}>{ROLE_LABELS[role]}</Badge>
            ))}
            {member.site_roles.map((binding) => (
              <Badge key={`${binding.role}-${binding.site_id}`} tone="neutral">
                {ROLE_LABELS[binding.role]} · {binding.site_name ?? 'site'}
              </Badge>
            ))}
            {member.roles.length + member.site_roles.length === 0 ? (
              <span className="text-xs text-muted">Aucun rôle</span>
            ) : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <PerimeterBadge member={member} />
            <SensitiveAccessBadge member={member} />
          </div>
        </TableCell>
        <TableCell>
          <AccessCell member={member} />
        </TableCell>
        <TableCell>
          <Badge tone={suspended ? 'important' : 'success'}>{MEMBERSHIP_STATUS_LABELS[member.status]}</Badge>
        </TableCell>
        <TableCell className="text-right whitespace-nowrap">
          {member.is_self ? (
            <span className="text-xs text-muted">Géré par un autre administrateur</span>
          ) : (
            <div className="flex justify-end gap-1">
              <Button size="sm" variant="ghost" onClick={() => setEditing((open) => !open)} aria-expanded={editing}>
                Rôles
              </Button>
              {member.roles.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={() => setLimiting((open) => !open)} aria-expanded={limiting}>
                  Périmètre
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setHabilitating((open) => !open)}
                aria-expanded={habilitating}
              >
                Sites sensibles
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => update.mutate({ status: suspended ? 'active' : 'suspended' })}
              >
                {suspended ? 'Réactiver' : 'Suspendre'}
              </Button>
              {member.second_factor ? (
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset((open) => !open)}>
                  Réinitialiser la double authentification
                </Button>
              ) : null}
            </div>
          )}
        </TableCell>
      </TableRow>
      {habilitating ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-subtle/40">
            <SensitiveAccessForm member={member} onDone={() => setHabilitating(false)} />
          </TableCell>
        </TableRow>
      ) : null}
      {limiting ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-subtle/40">
            <MemberPerimeterForm member={member} onDone={() => setLimiting(false)} />
          </TableCell>
        </TableRow>
      ) : null}
      {confirmReset ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-subtle/40">
            <div className="max-w-2xl space-y-3">
              {reset.error ? <ApiErrorAlert error={reset.error} /> : null}
              <p className="text-sm">
                Vérifiez d’abord l’identité de {member.display_name ?? member.email} (téléphone perdu, appel de vive
                voix). Sa double authentification et ses sessions seront supprimées ; elle devra en activer une nouvelle
                à sa prochaine connexion et sera prévenue par e-mail. L’opération est tracée.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={reset.isPending}
                  onClick={() => reset.mutate(undefined, { onSuccess: () => setConfirmReset(false) })}
                >
                  {reset.isPending ? 'Réinitialisation…' : 'Réinitialiser'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
      {update.error && !editing ? (
        <TableRow>
          <TableCell colSpan={5}>
            <ApiErrorAlert error={update.error} />
          </TableCell>
        </TableRow>
      ) : null}
      {editing ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-subtle/40">
            <div className="max-w-2xl space-y-3">
              {update.error ? <ApiErrorAlert error={update.error} /> : null}
              <RoleChoices name={`roles-${member.id}`} selected={roles} onChange={setRoles} />
              {roles.length === 0 && member.site_roles.length === 0 ? (
                <p className="text-sm text-important">Sans rôle, la personne n’aura plus accès à rien dans ce SIS.</p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={update.isPending}
                  onClick={() => update.mutate({ roles }, { onSuccess: () => setEditing(false) })}
                >
                  {update.isPending ? 'Enregistrement…' : 'Enregistrer les rôles'}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    update.reset();
                    setEditing(false);
                  }}
                >
                  Annuler
                </Button>
              </div>
            </div>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** Members of the SIS and their roles (shown to member:manage holders only). */
export function MembersAdmin() {
  const members = useMembers();
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<MemberInvitation | null>(null);

  return (
    <>
      {!inviting && members.data ? (
        <div className="mb-4 flex justify-end">
          <Button
            onClick={() => {
              setResult(null);
              setInviting(true);
            }}
          >
            Inviter une personne
          </Button>
        </div>
      ) : null}
      <div className="space-y-4">
        {result ? (
          <Alert tone="info">
            {result.invitation === 'sent'
              ? `Invitation envoyée à ${result.member.email} : la personne active son compte depuis le lien reçu.`
              : `${result.member.email} dispose déjà d’un compte : rattaché à votre SIS, il se connecte avec ses identifiants habituels.`}
          </Alert>
        ) : null}
        {inviting ? (
          <Card>
            <CardHeader>
              <CardTitle>Inviter une personne</CardTitle>
              <CardDescription>
                Un e-mail d’activation lui est envoyé. Les rôles de validation et d’administration exigent la double
                authentification.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm
                onClose={(invitation) => {
                  setResult(invitation);
                  setInviting(false);
                }}
              />
            </CardContent>
          </Card>
        ) : null}
        {members.isPending ? <LoadingCard lines={5} /> : null}
        {members.error ? <ApiErrorAlert error={members.error} /> : null}
        {members.data ? (
          <Card>
            <CardHeader>
              <CardTitle>Membres ({members.data.length})</CardTitle>
              <CardDescription>
                Personne ne modifie ses propres habilitations ; un SIS garde toujours au moins un administrateur actif.
                Suspendre un membre ferme aussitôt toutes ses sessions.
              </CardDescription>
            </CardHeader>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Personne</TableHeaderCell>
                  <TableHeaderCell>Rôles</TableHeaderCell>
                  <TableHeaderCell>Accès</TableHeaderCell>
                  <TableHeaderCell>Statut</TableHeaderCell>
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <tbody>
                {members.data.map((member) => (
                  <MemberRow key={`${member.id}-${member.row_version}`} member={member} />
                ))}
              </tbody>
            </Table>
          </Card>
        ) : null}
      </div>
    </>
  );
}
