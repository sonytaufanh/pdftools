import { Component } from 'react';
import { AlertTriangle, ClipboardCopy, RefreshCw } from 'lucide-react';
import { BUILD_INFO, reportError } from '../lib/errorReporting';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, copied: false };
    this.handleReset = this.handleReset.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.report = reportError(error, {
      source: 'error-boundary',
      componentStack: info?.componentStack
    });
    this.props.onError?.(error, info);
  }

  handleReset() {
    this.setState({ error: null, copied: false });
  }

  async handleCopy() {
    const details = this.report ?? {
      ...BUILD_INFO,
      message: this.state.error?.message,
      stack: this.state.error?.stack
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
      this.setState({ copied: true });
    } catch (error) {
      console.warn('[PDFTools] Unable to copy error details.', error);
    }
  }

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === 'function') {
      return this.props.fallback({ error, reset: this.handleReset });
    }

    return (
      <div className="app-error-fallback" role="alert">
        <div className="app-error-card">
          <div className="app-error-icon" aria-hidden="true">
            <AlertTriangle size={28} />
          </div>
          <h2 className="app-error-title">{this.props.title || 'Terjadi kesalahan'}</h2>
          <p className="app-error-detail">
            {this.props.message ||
              'Bagian ini mengalami error tak terduga. Coba lagi, atau muat ulang halaman jika masalah berlanjut.'}
          </p>
          {error?.message && <pre className="app-error-trace">{error.message}</pre>}
          <p className="app-error-version">Versi {BUILD_INFO.version}</p>
          <div className="app-error-actions">
            <button type="button" className="secondary-button" onClick={this.handleReset}>
              <RefreshCw size={16} />
              Coba lagi
            </button>
            <button type="button" className="secondary-button" onClick={this.handleCopy}>
              <ClipboardCopy size={16} />
              {copied ? 'Tersalin' : 'Salin detail'}
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => window.location.reload()}
            >
              Muat ulang halaman
            </button>
          </div>
        </div>
      </div>
    );
  }
}
