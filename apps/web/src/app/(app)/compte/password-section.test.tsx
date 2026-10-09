import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PasswordSection } from './password-section';

const updateUser = vi.fn();
const signOut = vi.fn(async () => ({ error: null }));
const invalidateQueries = vi.fn(async () => undefined);

vi.mock('@/lib/supabase-browser', () => ({ supabaseBrowser: () => ({ auth: { updateUser, signOut } }) }));
vi.mock('@/lib/queries', () => ({ queryKeys: { mySessions: (userId: string) => ['me', userId, 'sessions'] } }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('@/providers/session-provider', () => ({
  useSession: () => ({ session: { user: { id: 'user-1', email: 'a@b.fr' } } }),
}));

function openAndFill(password: string, confirmation: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Modifier mon mot de passe' }));
  fireEvent.change(screen.getByLabelText('Nouveau mot de passe'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirmation'), { target: { value: confirmation } });
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
}

describe('PasswordSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('checks the rules and the confirmation before calling the identity provider', async () => {
    render(<PasswordSection />);
    openAndFill('court', 'autre');
    expect(await screen.findByText('12 caractères minimum.')).toBeTruthy();
    expect(screen.getByText('Les deux saisies sont différentes.')).toBeTruthy();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('saves the password, closes the other sessions and says so', async () => {
    updateUser.mockResolvedValue({ error: null });
    render(<PasswordSection />);
    openAndFill('Nouveau-mot-2026!', 'Nouveau-mot-2026!');
    expect(await screen.findByText('Mot de passe modifié. Vos autres sessions ont été fermées.')).toBeTruthy();
    expect(updateUser).toHaveBeenCalledWith({ password: 'Nouveau-mot-2026!' });
    expect(signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['me', 'user-1', 'sessions'] });
    // Back to the closed state, nothing left in the fields.
    expect(screen.getByRole('button', { name: 'Modifier mon mot de passe' })).toBeTruthy();
    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
  });

  it('translates the refusals of the provider', async () => {
    updateUser.mockResolvedValue({ error: { code: 'weak_password' } });
    render(<PasswordSection />);
    openAndFill('Motdepasse-2026!', 'Motdepasse-2026!');
    expect(
      await screen.findByText('Ce mot de passe est trop faible ou trop courant : choisissez-en un autre.'),
    ).toBeTruthy();
    expect(signOut).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy());
  });

  it('cancels without touching anything', () => {
    render(<PasswordSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier mon mot de passe' }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
