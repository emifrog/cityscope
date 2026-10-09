import type { Building, Document, SubstanceCreateInput, Zone } from '@etare/contracts';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SubstanceForm, substanceFormDefaults, substanceFormSchema, toSubstancePayload } from './substances-panel';

afterEach(cleanup);

const SITE = '06000002-0000-4000-8000-000000000001';
const BUILDING = '06000003-0000-4000-8000-000000000001';
const LEVEL = '06000004-0000-4000-8000-000000000001';
const ZONE = '06000005-0000-4000-8000-000000000001';
const FDS = '06000006-0000-4000-8000-000000000001';
const NOTICE = '06000006-0000-4000-8000-000000000002';

const buildings: Building[] = [
  {
    id: BUILDING,
    site_id: SITE,
    name: 'Bâtiment A',
    code: null,
    status: 'active',
    sort_order: 0,
    construction_type: null,
    height_m: null,
    floors_above: null,
    floors_below: null,
    notes: null,
    footprint: null,
    row_version: 1,
    levels: [
      {
        id: LEVEL,
        building_id: BUILDING,
        label: 'RDC',
        sort_order: 0,
        elevation_m: null,
        status: 'active',
        row_version: 1,
      },
    ],
  },
];

const zones: Zone[] = [
  {
    id: ZONE,
    site_id: SITE,
    level_id: LEVEL,
    name: 'Local technique',
    zone_type: 'technical',
    plan_position: null,
    status: 'active',
    row_version: 1,
  },
];

const document = (id: string, title: string, category: Document['category']): Document => ({
  id,
  site_id: SITE,
  category,
  title,
  offline_policy: 'never',
  portal_visible: false,
  status: 'active',
  row_version: 1,
  versions: [],
});
const documents = [document(FDS, 'FDS acide chlorhydrique', 'fds'), document(NOTICE, 'Notice chaufferie', 'notice')];

describe('substance form schema', () => {
  it('refuses a quantity without its unit', () => {
    const result = substanceFormSchema.safeParse({ ...substanceFormDefaults(), name: 'Acide', quantity: '12' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['unit', 'Une quantité s’accompagne de son unité.'],
    ]);
  });

  it('refuses a UN number that is not four digits', () => {
    const result = substanceFormSchema.safeParse({ ...substanceFormDefaults(), name: 'Acide', un_number: '17' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['un_number']);
  });

  it('converts the texts of the form into the payload of the API', () => {
    expect(
      toSubstancePayload({
        ...substanceFormDefaults(),
        name: '  Acide chlorhydrique  ',
        hazard_classes: ['GHS05', 'GHS07'],
        un_number: '1789',
        physical_state: 'liquid',
        quantity: '12,5',
        unit: 'L',
        building_id: BUILDING,
        level_id: LEVEL,
        fds_document_id: FDS,
      }),
    ).toEqual({
      name: 'Acide chlorhydrique',
      hazard_classes: ['GHS05', 'GHS07'],
      un_number: '1789',
      physical_state: 'liquid',
      quantity: 12.5,
      unit: 'L',
      building_id: BUILDING,
      level_id: LEVEL,
      zone_id: null,
      location_note: null,
      fds_document_id: FDS,
      notes: null,
    });
  });
});

describe('SubstanceForm', () => {
  const renderForm = (onSubmit = vi.fn(async (_payload: SubstanceCreateInput) => undefined)) => {
    render(
      <SubstanceForm
        buildings={buildings}
        zones={zones}
        documents={documents}
        submitLabel="Ajouter la matière"
        pending={false}
        error={null}
        onSubmit={onSubmit}
      />,
    );
    return onSubmit;
  };

  it('requires the name and the unit of a quantity', async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la matière' }));

    expect(await screen.findByText('Le nom est obligatoire.')).toBeTruthy();
    expect(screen.getByText('Une quantité s’accompagne de son unité.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('only offers the safety data sheets of the site', () => {
    renderForm();
    const options = Array.from(screen.getByLabelText('Fiche de données de sécurité').querySelectorAll('option'));
    expect(options.map((option) => option.textContent)).toEqual(['Aucune', 'FDS acide chlorhydrique']);
  });

  it('submits the converted payload, with the location chosen step by step', async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Nom du produit'), { target: { value: 'Acide chlorhydrique' } });
    fireEvent.click(screen.getByLabelText('GHS05 · Corrosif'));
    fireEvent.change(screen.getByLabelText('Numéro ONU'), { target: { value: '1789' } });
    fireEvent.change(screen.getByLabelText('État physique'), { target: { value: 'liquid' } });
    fireEvent.change(screen.getByLabelText('Quantité'), { target: { value: '12,5' } });
    fireEvent.change(screen.getByLabelText('Unité'), { target: { value: 'L' } });
    fireEvent.change(screen.getByLabelText('Bâtiment'), { target: { value: BUILDING } });
    fireEvent.change(screen.getByLabelText('Niveau'), { target: { value: LEVEL } });
    fireEvent.change(screen.getByLabelText('Zone'), { target: { value: ZONE } });
    fireEvent.change(screen.getByLabelText('Fiche de données de sécurité'), { target: { value: FDS } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la matière' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      name: 'Acide chlorhydrique',
      hazard_classes: ['GHS05'],
      un_number: '1789',
      physical_state: 'liquid',
      quantity: 12.5,
      unit: 'L',
      building_id: BUILDING,
      level_id: LEVEL,
      zone_id: ZONE,
      location_note: null,
      fds_document_id: FDS,
      notes: null,
    });
  });

  it('submits the whole site as location when nothing is chosen', async () => {
    const onSubmit = renderForm();
    fireEvent.change(screen.getByLabelText('Nom du produit'), { target: { value: 'Propane' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ajouter la matière' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      name: 'Propane',
      hazard_classes: [],
      building_id: null,
      level_id: null,
      zone_id: null,
    });
  });
});
