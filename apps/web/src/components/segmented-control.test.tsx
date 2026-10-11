import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './segmented-control';

afterEach(cleanup);

describe('SegmentedControl', () => {
  it('marks the chosen view, shows the counts it knows, and hands back a click', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Vues"
        value="open"
        onChange={onChange}
        options={[
          { value: 'open', label: 'À traiter', count: 3 },
          { value: 'closed', label: 'Traités' },
        ]}
      />,
    );
    const open = screen.getByRole('button', { name: /À traiter/ });
    expect(open.getAttribute('aria-pressed')).toBe('true');
    const closed = screen.getByRole('button', { name: 'Traités' });
    expect(closed.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(closed);
    expect(onChange).toHaveBeenCalledWith('closed');
  });
});
