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
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/api-client';
import { queryKeys, useApiMutation, useMembers, usePermissions } from '@/lib/queries';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';

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
      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" size="sm" disabled={invite.isPending}>
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
  const [roles, setRoles] = useState<TenantWideRole[]>(() =>
    member.roles.filter((role): role is TenantWideRole => (TENANT_WIDE_ROLES as readonly string[]).includes(role)),
  );
  const update = useApiMutation(
    (options, patch: MemberUpdate) => api.updateMember(options, member.id, member.row_version, patch),
    (tenantId) => [queryKeys.members(tenantId)],
  );
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
              <Button
                size="sm"
                variant="ghost"
                disabled={update.isPending}
                onClick={() => update.mutate({ status: suspended ? 'active' : 'suspended' })}
              >
                {suspended ? 'Réactiver' : 'Suspendre'}
              </Button>
            </div>
          )}
        </TableCell>
      </TableRow>
      {update.error && !editing ? (
        <TableRow>
          <TableCell colSpan={4}>
            <ApiErrorAlert error={update.error} />
          </TableCell>
        </TableRow>
      ) : null}
      {editing ? (
        <TableRow>
          <TableCell colSpan={4} className="bg-subtle/40">
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

export function MembersAdmin() {
  const { ready } = useSession();
  const { loading } = useTenant();
  const canManage = usePermissions().has('member:manage');
  const members = useMembers();
  const [inviting, setInviting] = useState(false);
  const [result, setResult] = useState<MemberInvitation | null>(null);

  // Roles come with the active SIS: do not conclude anything before it is known.
  if (!ready || loading) return <LoadingCard lines={5} />;
  if (!canManage) {
    return (
      <>
        <PageHeader title="Administration" />
        <Alert tone="info">L’administration du SIS est réservée à ses administrateurs.</Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Administration"
        description="Membres du SIS et leurs rôles. Terminaux, catalogues et paramètres : à venir."
        actions={
          !inviting && members.data ? (
            <Button
              onClick={() => {
                setResult(null);
                setInviting(true);
              }}
            >
              Inviter une personne
            </Button>
          ) : null
        }
      />
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
              </CardDescription>
            </CardHeader>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Personne</TableHeaderCell>
                  <TableHeaderCell>Rôles</TableHeaderCell>
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
