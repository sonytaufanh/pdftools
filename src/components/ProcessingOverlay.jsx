export default function ProcessingOverlay({
  progress,
  loadingProgress,
  label = 'Memproses...',
  detail
}) {
  const activeProgress = progress ?? loadingProgress ?? { current: 0, total: 0 };
  const hasProgress = activeProgress.total > 0;
  const percentage = hasProgress
    ? Math.round((activeProgress.current / activeProgress.total) * 100)
    : 0;

  return (
    <div className="processing-overlay">
      <div className="processing-card">
        <div className="spinner" />
        <h2>{label}</h2>
        {detail && <p className="processing-detail">{detail}</p>}
        {hasProgress && <p className="field-value">{percentage}%</p>}
      </div>
    </div>
  );
}
