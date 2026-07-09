import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, ShieldCheck } from 'lucide-react';
import PDFToolsPage from './pages/PDFToolsPage';
import MergeFilesPage from './pages/MergeFilesPage';
import CompressPdfPage from './pages/CompressPdfPage';
import PdfToImagePage from './pages/PdfToImagePage';
import ImageToPdfPage from './pages/ImageToPdfPage';
import { DEFAULT_ROUTE, NAV_ITEMS, getActiveNavItem } from './config/navigation';

const SIDEBAR_SECTIONS = [
  {
    title: 'FILE MANAGEMENT',
    items: ['/pdf-tools', '/merge-files']
  },
  {
    title: 'PDF OPTIMIZATION',
    items: ['/compress-pdf']
  },
  {
    title: 'FILE CONVERSION',
    items: ['/pdf-to-image', '/image-to-pdf']
  }
];

function TopBar() {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <span className="logo-mark" aria-hidden="true">
            <span className="logo-stripe stripe-dark" />
            <span className="logo-stripe stripe-red" />
            <span className="logo-stripe stripe-gray" />
          </span>
          <div className="topbar-title">PDFTools</div>
        </div>
        <button type="button" className="topbar-icon-button" aria-label="Toggle menu" title="Toggle menu">
          <Menu size={24} />
        </button>
      </div>
      <div className="topbar-actions">
        <div className="privacy-chip" title="Files are processed in your browser">
          <ShieldCheck size={16} />
          Browser-based
        </div>
      </div>
    </header>
  );
}

function Sidebar({ hasActivePdfSession, hasActiveMergeSession, onNavigate }) {
  const location = useLocation();

  return (
    <aside className="sidebar">
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
                  onClick={(event) => onNavigate(event, item.to)}
                >
                  <span className="sidebar-link-main">
                    <Icon size={16} />
                    <span className="sidebar-link-label">{item.label}</span>
                    {showStatus && <span className="sidebar-status-dot" title="In progress" />}
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
        <div className="content-kicker">Public Browser PDF Toolkit</div>
        <h1 className="content-title">{activeItem.label}</h1>
      </div>
      <div className="content-meta">Merge, compress, rotate, watermark, and convert files locally in the browser</div>
    </div>
  );
}

function NavigationConfirmModal({ open, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-modal simple-confirm-modal navigation-confirm-modal">
        <div className="confirm-header">
          <h2 id="confirm-title" className="confirm-title">Active Work Session</h2>
        </div>
        <div className="confirm-body">
          <p className="confirm-text">You still have an active document. Continue to another module?</p>
        </div>
        <div className="confirm-footer">
          <div className="confirm-actions">
            <button type="button" className="confirm-button secondary" onClick={onCancel}>
              Stay
            </button>
            <button type="button" className="confirm-button primary" onClick={onConfirm}>
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer">
      PDFTools &copy; 2026 - Browser-based document processing
    </footer>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [hasActivePdfSession, setHasActivePdfSession] = useState(false);
  const [hasActiveMergeSession, setHasActiveMergeSession] = useState(false);
  const [pendingPath, setPendingPath] = useState(null);
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
    }
  ];

  useEffect(() => {
    if (location.pathname === '/') {
      navigate(DEFAULT_ROUTE, { replace: true });
    }
  }, [location.pathname, navigate]);

  function handleSidebarNavigate(event, nextPath) {
    const currentRouteHasActiveSession =
      (location.pathname === DEFAULT_ROUTE && hasActivePdfSession) ||
      (location.pathname === '/merge-files' && hasActiveMergeSession);

    if (
      nextPath === location.pathname ||
      !currentRouteHasActiveSession
    ) {
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
        <TopBar />
        <div className="workspace-layout">
          <Sidebar
            hasActivePdfSession={hasActivePdfSession}
            hasActiveMergeSession={hasActiveMergeSession}
            onNavigate={handleSidebarNavigate}
          />
          <main className="content-area">
            <ContentHeader />
            {routePanels.map(route => (
              <section
                key={route.path}
                className={location.pathname === route.path || (location.pathname === '/' && route.path === DEFAULT_ROUTE) ? 'route-panel active' : 'route-panel hidden'}
              >
                {route.element}
              </section>
            ))}
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
