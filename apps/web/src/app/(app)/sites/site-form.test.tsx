import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteForm, siteFormDefaults, toSitePayload, type SitePayload } from './site-form';

afterEach(cleanup);

describe('site payload', () => {
  it('clears empty fields and orders coordinates as longitude, latitude', () => {
    const payload = toSitePayload({
      ...siteFormDefaults(),
      name: '  Collège des Pins  ',
      site_type: 'education',
      street: '3 rue des Écoles',
      postal_code: '06100',
      city: 'Nice',
      latitude: '43,72',
      longitude: '7.26',
    });
    expect(payload).toEqual({
      name: 'Collège des Pins',
      short_name: null,
      site_type: 'education',
      status: 'draft',
      sensitivity: 'normal',
      etare_number: null,
      address: { street: '3 rue des Écoles', postal_code: '06100', city: 'Nice', insee_code: null },
      location: { type: 'Point', coordinates: [7.26, 43.72] },
    });
  });

  it('removes the address when no city is given', () => {
    expect(toSitePayload({ ...siteFormDefaults(), name: 'Site' }).address).toBeNull();
  });
});

describe('SiteForm', () => {
  it('validates before submitting', async () => {
    const onSubmit = vi.fn(async () => undefined);
    render(<SiteForm mode="create" submitting={false} error={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Code postal'), { target: { value: '6000' } });
    fireEvent.change(screen.getByLabelText('Latitude'), { target: { value: '43.7' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le site' }));

    expect(await screen.findByText('Le nom est obligatoire.')).toBeTruthy();
    expect(screen.getByText('Code postal à 5 chiffres.')).toBeTruthy();
    expect(screen.getByText('Renseignez latitude et longitude ensemble.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('only offers draft and active when creating', () => {
    render(<SiteForm mode="create" submitting={false} error={null} onSubmit={vi.fn()} />);
    const options = Array.from(screen.getByLabelText('Statut').querySelectorAll('option')).map((o) => o.value);
    expect(options).toEqual(['draft', 'active']);
  });

  it('submits the converted payload', async () => {
    const onSubmit = vi.fn(async (_payload: SitePayload) => undefined);
    render(<SiteForm mode="create" submitting={false} error={null} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText('Nom du site'), { target: { value: 'Entrepôt (démo)' } });
    fireEvent.change(screen.getByLabelText('Type de site'), { target: { value: 'industrial' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le site' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ name: 'Entrepôt (démo)', site_type: 'industrial' });
  });
});
