import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SiteFilterBar, refinementCount } from './site-filter-bar';

const replace = vi.fn();
let search = '';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/sites',
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock('@/lib/queries', () => ({
  useRiskTypes: () => ({ data: [{ id: '0a000001-0000-4000-8000-000000000001', name: 'Incendie' }] }),
}));

describe('SiteFilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    search = '';
  });
  afterEach(cleanup);

  it('keeps the criteria folded until one is used, then counts them', () => {
    const { unmount } = render(<SiteFilterBar filters={{}} idPrefix="t" label="Filtrer" />);
    const toggle = screen.getByRole('button', { name: 'Filtres' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByLabelText('Type').closest('div[id]')?.className).toContain('hidden');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    unmount();

    render(<SiteFilterBar filters={{ site_type: 'health', city: 'Nice' }} idPrefix="t" label="Filtrer" />);
    expect(screen.getByRole('button', { name: 'Filtres (2)' }).getAttribute('aria-expanded')).toBe('true');
    expect(refinementCount({ q: 'ehpad', site_type: 'health', city: 'Nice' })).toBe(2);
  });

  it('rewrites the URL with the filled fields only, folded ones included', () => {
    const onApply = vi.fn();
    render(<SiteFilterBar filters={{}} idPrefix="t" label="Filtrer" onApply={onApply} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Recherche' }), { target: { value: ' ehpad ' } });
    fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'health' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/sites?q=ehpad&type=health');
  });

  it('goes back to the bare page when everything is cleared', () => {
    search = 'q=ehpad';
    render(<SiteFilterBar filters={{ q: 'ehpad' }} idPrefix="t" label="Filtrer" />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Recherche' }), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(replace).toHaveBeenCalledWith('/sites');
  });
});
