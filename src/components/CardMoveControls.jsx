import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CardMoveControls({
  label,
  canMoveBackward,
  canMoveForward,
  onMoveBackward,
  onMoveForward
}) {
  return (
    <div className="page-move-controls">
      <button
        type="button"
        className="page-move-button"
        onClick={event => {
          event.stopPropagation();
          onMoveBackward();
        }}
        disabled={!canMoveBackward}
        aria-label={`Pindahkan ${label} ke depan`}
        title="Pindahkan ke depan"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="page-move-button"
        onClick={event => {
          event.stopPropagation();
          onMoveForward();
        }}
        disabled={!canMoveForward}
        aria-label={`Pindahkan ${label} ke belakang`}
        title="Pindahkan ke belakang"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
