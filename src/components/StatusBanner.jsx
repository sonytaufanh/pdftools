import { CheckCircle2, Info, LoaderCircle, ShieldAlert } from 'lucide-react';

const STATUS_ICONS = {
  error: ShieldAlert,
  success: CheckCircle2,
  loading: LoaderCircle,
  info: Info
};

export default function StatusBanner({ status }) {
  if (!status) return null;

  const tone = status.tone ?? 'info';
  const Icon = STATUS_ICONS[tone] ?? STATUS_ICONS.info;

  return (
    <div className={`status-banner ${tone}`}>
      <div className="status-banner-icon">
        <Icon size={16} className={tone === 'loading' ? 'spin-icon' : ''} />
      </div>
      <div className="status-banner-copy">
        <div className="status-banner-title">{status.title}</div>
        {status.detail && <div className="status-banner-detail">{status.detail}</div>}
      </div>
    </div>
  );
}
