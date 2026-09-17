import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import ModalOverlay from './components/ModalOverlay';
import { onSessionStorageError } from './lib/sessionStore';
import { DEFAULT_ROUTE, NAV_ITEMS, getActiveNavItem } from './config/navigation';

const PDFToolsPage = lazy(() => import('./pages/PDFToolsPage'));
const MergeFilesPage = lazy(() => import('./pages/MergeFilesPage'));
const CompressPdfPage = lazy(() => import('./pages/CompressPdfPage'));
const PdfToImagePage = lazy(() => import('./pages/PdfToImagePage'));
const ImageToPdfPage = lazy(() => import('./pages/ImageToPdfPage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));

const SIDEBAR_SECTIONS = [
  {
    title: 'MANAJEMEN FILE',
    items: ['/pdf-tools', '/merge-files']
  },
  {
    title: 'OPTIMASI PDF',
    items: ['/compress-pdf']
  },
  {
    title: 'KONVERSI FILE',
    items: ['/pdf-to-image', '/image-to-pdf']
  },
  {
    title: 'BANTUAN',
    items: ['/guide']
  }
];

function TopBar({ isSidebarOpen, onToggleSidebar }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <img className="logo-mark" src="/modernland.png" alt="Modernland" />
          <div className="topbar-title">Modernland</div>
        </div>
        <button
          type="button"
          className="topbar-icon-button"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Sembunyikan navigasi' : 'Tampilkan navigasi'}
          aria-expanded={isSidebarOpen}
          aria-controls="app-sidebar"
          title={isSidebarOpen ? 'Sembunyikan navigasi' : 'Tampilkan navigasi'}
        >
          <Menu size={24} />
        </button>
      </div>
    </header>
  );
}

function Sidebar({ hasActivePdfSession, hasActiveMergeSession, onNavigate }) {
  const location = useLocation();

  return (
    <aside id="app-sidebar" className="sidebar">
      {SIDEBAR_SECTIONS.map(section => (
        <div key={section.title} className="sidebar-section">
          <div className="sidebar-heading">{section.title}</div>
          <nav className="sidebar-nav">
            {section.items.map(path => {
              const item = NAV_ITEMS.find(navItem => navItem.to === path);
              if (!item) return null;

              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              const showStatus =
                (item.to === '/pdf-tools' && hasActivePdfSession) ||
                (item.to === '/merge-files' && hasActiveMergeSession);

              return (
                <Link
                  key={item.to}
                  className={isActive ? 'sidebar-link active' : 'sidebar-link'}
                  to={item.to}
                  onClick={event => onNavigate(event, item.to)}
                >
                  <span className="sidebar-link-main">
                    <Icon size={16} />
                    <span className="sidebar-link-label">{item.label}</span>
                    {showStatus && <span className="sidebar-status-dot" title="Sedang berjalan" />}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}

function ContentHeader() {
  const location = useLocation();
  const activeItem = getActiveNavItem(location.pathname);

  return (
    <div className="content-header">
      <div>
        <div className="content-kicker">Toolkit Dokumen Modernland</div>
        <h1 className="content-title">{activeItem.label}</h1>
      </div>
      <div className="content-meta">
        Gabung, kompres, putar, watermark, dan konversi file secara lokal
      </div>
    </div>
  );
}

function NavigationConfirmModal({ open, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <ModalOverlay open={open} onClose={onCancel} labelledBy="confirm-title">
      <div className="confirm-modal simple-confirm-modal navigation-confirm-modal">
        <div className="confirm-header">
          <h2 id="confirm-title" className="confirm-title">
            Sesi Kerja Aktif
          </h2>
        </div>
        <div className="confirm-body">
          <p className="confirm-text">Masih ada dokumen aktif. Lanjut ke modul lain?</p>
        </div>
        <div className="confirm-footer">
          <div className="confirm-actions">
            <button type="button" className="confirm-button secondary" onClick={onCancel}>
              Tetap di sini
            </button>
            <button type="button" className="confirm-button primary" onClick={onConfirm}>
              Lanjut
            </button>
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}

function RouteLoading() {
  return (
    <section className="panel route-loading-panel" aria-busy="true" aria-live="polite">
      <div className="spinner" />
      <p className="field-value">Memuat modul...</p>
    </section>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer">
      <p className="app-footer-credit">by Digital Management Modernland &copy; 2026</p>
    </footer>
  );
}

function SessionStorageWarning({ warning, onDismiss }) {
  if (!warning) return null;

  return (
    <div className="status-banner info session-storage-warning" role="status">
      <div className="status-banner-copy">
        <div className="status-banner-title">
          {warning.quotaExceeded ? 'Penyimpanan browser penuh' : 'Sesi gagal disimpan'}
        </div>
        <div className="status-banner-detail">
          Pekerjaan Anda tetap terbuka, tapi bisa hilang jika halaman dimuat ulang. Hapus data situs
          ini di pengaturan browser untuk mengosongkan ruang.
        </div>
      </div>
      <button
        type="button"
        className="toast-close"
        onClick={onDismiss}
        aria-label="Tutup peringatan penyimpanan"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasActivePdfSession, setHasActivePdfSession] = useState(false);
  const [hasActiveMergeSession, setHasActiveMergeSession] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
  const [storageWarning, setStorageWarning] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const activePath = location.pathname === '/' ? DEFAULT_ROUTE : location.pathname;
  const [visitedPaths, setVisitedPaths] = useState(() => new Set([activePath]));
  const routePanels = [
    {
      path: DEFAULT_ROUTE,
      element: <PDFToolsPage onSessionChange={setHasActivePdfSession} />
    },
    {
      path: '/merge-files',
      element: <MergeFilesPage onSessionChange={setHasActiveMergeSession} />
    },
    {
      path: '/compress-pdf',
      element: <CompressPdfPage />
    },
    {
      path: '/pdf-to-image',
      element: <PdfToImagePage />
    },
    {
      path: '/image-to-pdf',
      element: <ImageToPdfPage />
    },
    {
      path: '/guide',
      element: <GuidePage />
    }
  ];

  useEffect(() => {
    if (location.pathname === '/') {
      navigate(DEFAULT_ROUTE, { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    setVisitedPaths(prev => (prev.has(activePath) ? prev : new Set(prev).add(activePath)));
  }, [activePath]);

  useEffect(() => onSessionStorageError(detail => setStorageWarning(detail)), []);

  function handleSidebarNavigate(event, nextPath) {
    const currentRouteHasActiveSession =
      (location.pathname === DEFAULT_ROUTE && hasActivePdfSession) ||
      (location.pathname === '/merge-files' && hasActiveMergeSession);

    if (nextPath === location.pathname || !currentRouteHasActiveSession) {
      return;
    }

    event.preventDefault();
    setPendingPath(nextPath);
  }

  function handleCancelNavigation() {
    setPendingPath(null);
  }

  function handleConfirmNavigation() {
    if (pendingPath) {
      navigate(pendingPath);
    }
    setPendingPath(null);
  }

  return (
    <div className="app-shell">
      <div className="app-container">
        <TopBar
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(open => !open)}
        />
        <div className={isSidebarOpen ? 'workspace-layout' : 'workspace-layout sidebar-collapsed'}>
          <Sidebar
            hasActivePdfSession={hasActivePdfSession}
            hasActiveMergeSession={hasActiveMergeSession}
            onNavigate={handleSidebarNavigate}
          />
          <main className="content-area">
            <ContentHeader />
            <SessionStorageWarning
              warning={storageWarning}
              onDismiss={() => setStorageWarning(null)}
            />
            {routePanels.map(route => {
              const isActive = route.path === activePath;
              if (!isActive && !visitedPaths.has(route.path)) return null;

              return (
                <section
                  key={route.path}
                  className={isActive ? 'route-panel active' : 'route-panel hidden'}
                >
                  <ErrorBoundary>
                    <Suspense fallback={<RouteLoading />}>{route.element}</Suspense>
                  </ErrorBoundary>
                </section>
              );
            })}
            <AppFooter />
          </main>
        </div>
      </div>
      <NavigationConfirmModal
        open={Boolean(pendingPath)}
        onCancel={handleCancelNavigation}
        onConfirm={handleConfirmNavigation}
      />
    </div>
  );
}
