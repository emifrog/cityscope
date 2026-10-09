import { describe, expect, it } from 'vitest';
import { displayNameOf, initialsOf } from './identity';

describe('identity of the account', () => {
  it('takes the initials of the first and last words of the display name', () => {
    expect(initialsOf('Cne Martin', 'martin@sdis06.fr')).toBe('CM');
    expect(initialsOf('Marie-Lou Dupont de Nemours', 'x@y.fr')).toBe('MN');
    expect(initialsOf('  Durand ', 'x@y.fr')).toBe('D');
    expect(initialsOf('Validateur (06)', 'x@y.fr')).toBe('V0');
    expect(initialsOf('(SDIS) Martin', 'x@y.fr')).toBe('SM');
  });

  it('falls back to the first letter of the address', () => {
    expect(initialsOf(null, 'redacteur06@demo.etare.test')).toBe('R');
    expect(initialsOf('   ', 'a@b.fr')).toBe('A');
    expect(initialsOf(null, '')).toBe('?');
  });

  it('shows the display name, else the address', () => {
    expect(displayNameOf('Cne Martin', 'martin@sdis06.fr')).toBe('Cne Martin');
    expect(displayNameOf('  ', 'martin@sdis06.fr')).toBe('martin@sdis06.fr');
    expect(displayNameOf(null, 'martin@sdis06.fr')).toBe('martin@sdis06.fr');
  });
});
