import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './login-form';

const replace = vi.fn();
const refresh = vi.fn();
const signInWithPassword = vi.fn();
const needsSecondFactor = vi.fn(async () => false);

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));
vi.mock('@/lib/supabase-browser', () => ({ supabaseBrowser: () => ({ auth: { signInWithPassword } }) }));
vi.mock('@/lib/mfa', () => ({ needsSecondFactor: () => needsSecondFactor() }));

function fill(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Adresse e-mail professionnelle'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Mot de passe'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(cleanup);

  it('never sends credentials in the URL, even if submitted before hydration', () => {
    const { container } = render(<LoginForm next="/" />);
    expect(container.querySelector('form')?.getAttribute('method')).toBe('post');
  });

  it('validates the fields before calling the identity provider', async () => {
    render(<LoginForm next="/" />);
    fill('pas-un-email', '');
    expect(await screen.findByText('Adresse e-mail invalide.')).toBeTruthy();
    expect(screen.getByText('Mot de passe requis.')).toBeTruthy();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('redirects to the requested page after a successful sign-in', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<LoginForm next="/sites" />);
    fill('redacteur06@demo.etare.test', 'motdepasse');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sites'));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'redacteur06@demo.etare.test', password: 'motdepasse' });
  });

  it('sends people who enabled the double authentication to the code step', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    needsSecondFactor.mockResolvedValueOnce(true);
    render(<LoginForm next="/administration" />);
    fill('admin.sis06@demo.etare.test', 'motdepasse');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/verification?next=%2Fadministration'));
  });

  it('shows a neutral message on invalid credentials', async () => {
    signInWithPassword.mockResolvedValue({ error: { status: 400, message: 'Invalid login credentials' } });
    render(<LoginForm next="/" />);
    fill('redacteur06@demo.etare.test', 'mauvais');
    expect(await screen.findByText('Identifiant ou mot de passe incorrect.')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });
});
