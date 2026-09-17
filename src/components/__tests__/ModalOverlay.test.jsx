import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import ModalOverlay from '../ModalOverlay';

describe('ModalOverlay', () => {
  test('renders dialog content when open', () => {
    render(
      <ModalOverlay open onClose={() => {}} labelledBy="title">
        <h2 id="title">Confirm</h2>
        <button type="button">OK</button>
      </ModalOverlay>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-labelledby', 'title');
    expect(screen.getByText('Confirm')).toBeInTheDocument();
  });

  test('renders nothing when closed', () => {
    const { container } = render(
      <ModalOverlay open={false} onClose={() => {}}>
        <span>hidden</span>
      </ModalOverlay>
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <ModalOverlay open onClose={onClose} labelledBy="title">
        <h2 id="title">Confirm</h2>
        <button type="button">OK</button>
      </ModalOverlay>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
