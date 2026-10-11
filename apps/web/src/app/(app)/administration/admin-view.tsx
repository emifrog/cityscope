'use client';

import type { Permission } from '@etare/domain';
import { Alert, cn } from '@etare/ui';
import {
  Activity,
  Archive,
  Bell,
  Layers,
  MapPinned,
  ScrollText,
  Settings,
  Smartphone,
  TriangleAlert,
  Users,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LoadingCard } from '@/components/feedback';
import { TabLinks } from '@/components/tab-links';
import { usePermissions } from '@/lib/queries';
import { useSession } from '@/providers/session-provider';
import { useTenant } from '@/providers/tenant-provider';
import { AccessJournalAdmin } from './access-journal-admin';
import { BasemapsAdmin } from './basemaps-admin';
import { DevicesAdmin } from './devices-admin';
import { ExportsAdmin } from './exports-admin';
import { MembersAdmin } from './members-admin';
import { NotificationsAdmin } from './notifications-admin';
import { RiskCatalogAdmin } from './risk-catalog-admin';
import { SectorsAdmin } from './sectors-admin';
import { SettingsAdmin } from './settings-admin';
import { SupervisionAdmin } from './supervision-admin';

export interface AdminSection {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly permission: Permission;
  readonly icon: LucideIcon;
}

export interface AdminGroup {
  readonly title: string;
  readonly sections: readonly AdminSection[];
}

/** The sections of the administration, by theme; each needs a permission of the active SIS. */
export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    title: 'Personnes',
    sections: [
      {
        key: 'membres',
        label: 'Membres',
        description: 'Comptes du SIS, rôles, périmètres et habilitations aux sites sensibles.',
        permission: 'member:manage',
        icon: Users,
      },
      {
        key: 'secteurs',
        label: 'Secteurs',
        description: 'Découpage du SIS en secteurs et communes, pour limiter des membres et des tablettes.',
        permission: 'member:manage',
        icon: MapPinned,
      },
      {
        key: 'notifications',
        label: 'Notifications',
        description: 'Messages envoyés aux exploitants et aux membres, et leur acheminement.',
        permission: 'member:manage',
        icon: Bell,
      },
    ],
  },
  {
    title: 'Terrain',
    sections: [
      {
        key: 'terminaux',
        label: 'Terminaux',
        description: 'Tablettes enrôlées, synchronisation, politique de consultation hors ligne.',
        permission: 'device:manage',
        icon: Smartphone,
      },
      {
        key: 'fonds',
        label: 'Fonds de carte',
        description: 'Fonds embarqués sur les tablettes et leur fabrication.',
        permission: 'device:manage',
        icon: Layers,
      },
    ],
  },
  {
    title: 'Référentiels',
    sections: [
      {
        key: 'risques',
        label: 'Catalogue des risques',
        description: 'Types de risques proposés aux rédacteurs, actifs ou retirés.',
        permission: 'catalog:manage',
        icon: TriangleAlert,
      },
      {
        key: 'parametres',
        label: 'Paramètres',
        description: 'Réglages du SIS : second facteur, portail des exploitants, gabarit du dossier.',
        permission: 'member:manage',
        icon: Settings,
      },
    ],
  },
  {
    title: 'Sécurité et exploitation',
    sections: [
      {
        key: 'journal',
        label: 'Journal des sites sensibles',
        description: 'Qui a consulté, exporté ou ouvert un site sensible, et quand.',
        permission: 'audit:read',
        icon: ScrollText,
      },
      {
        key: 'supervision',
        label: 'Supervision',
        description: 'État des travaux de fond, des publications et des tablettes.',
        permission: 'audit:read',
        icon: Activity,
      },
      {
        key: 'export',
        label: 'Export de réversibilité',
        description: 'Données et fichiers du SIS dans un format ouvert, pour partir sans dépendre de FireScape.',
        permission: 'export:manage',
        icon: Archive,
      },
    ],
  },
];

/** The groups a person may open, with only the sections their permissions allow. */
export function allowedGroups(permissions: ReadonlySet<Permission>): AdminGroup[] {
  return ADMIN_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter((section) => permissions.has(section.permission)),
  })).filter((group) => group.sections.length > 0);
}

function SectionNav({ groups, active }: { groups: readonly AdminGroup[]; active: string }) {
  return (
    <nav aria-label="Sections de l’administration" className="hidden xl:block">
      {groups.map((group) => (
        <div key={group.title} className="mb-4">
          <p className="mb-1 px-3 text-xs font-semibold tracking-wide text-muted uppercase">{group.title}</p>
          <ul className="space-y-0.5">
            {group.sections.map((section) => {
              const selected = section.key === active;
              return (
                <li key={section.key}>
                  <Link
                    href={`/administration?onglet=${section.key}`}
                    scroll={false}
                    aria-current={selected ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm',
                      selected ? 'bg-info-soft font-semibold text-info' : 'text-foreground hover:bg-subtle',
                    )}
                  >
                    <section.icon aria-hidden="true" className="size-4 shrink-0" />
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Administration of the SIS: one section per permission held, grouped by theme. */
export function AdminView() {
  const { ready } = useSession();
  const { loading } = useTenant();
  const permissions = usePermissions();
  const requested = useSearchParams().get('onglet');

  // Roles come with the active SIS: do not conclude anything before it is known.
  if (!ready || loading) return <LoadingCard lines={5} />;
  const groups = allowedGroups(permissions);
  const sections = groups.flatMap((group) => group.sections);
  const section = sections.find((candidate) => candidate.key === requested) ?? sections[0];
  if (!section) {
    return (
      <>
        <h1 className="mb-4 text-2xl font-bold text-foreground">Administration</h1>
        <Alert tone="info">L’administration du SIS est réservée à ses administrateurs.</Alert>
      </>
    );
  }
  const Icon = section.icon;

  return (
    <>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground">Administration</h1>
        <p className="mt-1 text-sm text-muted">Le SIS, ses membres, ses terminaux et ses référentiels.</p>
      </div>
      <div className="xl:hidden">
        <TabLinks tabs={sections} active={section.key} param="onglet" basePath="/administration" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)] xl:items-start">
        <SectionNav groups={groups} active={section.key} />
        <div className="min-w-0">
          <div className="mb-5 flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand-navy text-white"
            >
              <Icon className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-foreground">{section.label}</h2>
              <p className="text-sm text-muted">{section.description}</p>
            </div>
          </div>
          {section.key === 'membres' ? (
            <MembersAdmin />
          ) : section.key === 'secteurs' ? (
            <SectorsAdmin />
          ) : section.key === 'terminaux' ? (
            <DevicesAdmin />
          ) : section.key === 'fonds' ? (
            <BasemapsAdmin />
          ) : section.key === 'notifications' ? (
            <NotificationsAdmin />
          ) : section.key === 'journal' ? (
            <AccessJournalAdmin />
          ) : section.key === 'parametres' ? (
            <SettingsAdmin />
          ) : section.key === 'supervision' ? (
            <SupervisionAdmin />
          ) : section.key === 'export' ? (
            <ExportsAdmin />
          ) : (
            <RiskCatalogAdmin />
          )}
        </div>
      </div>
    </>
  );
}
