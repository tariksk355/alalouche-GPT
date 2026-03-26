import { useState, useEffect, useMemo, useRef } from "react";
import { createPageUrl } from "@/utils";
import { backendClient } from "@/api/backendClient";
import { formatTime, formatDate, formatDateFull } from "@/components/formatDate";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
import AdminMarketing from "@/components/admin/AdminMarketing";
import DeviceProvisioning from "@/components/admin/DeviceProvisioning";
import { recordAdminLoginDiagnostic } from "@/lib/adminLoginDiagnostics";
import { clearStoredAdminSession, getStoredAdminSession } from "@/lib/customerAuth";
import { getAdminKpis, hideAdminOrder, hideAdminReservation, listAdminOrders, listAdminReservations, restoreAdminOrder, restoreAdminReservation, updateAdminOrderStatus, updateAdminReservationStatus } from "@/lib/api/adminOps";
import {
  createAdminMenuItem,
  deleteAdminMenuCategory,
  deleteAdminMenuItem,
  getAdminMenuCategoryOrder,
  getAdminMenuProductOrderByCategory,
  listAdminMenuCatalog,
  updateAdminMenuCategoryOrder,
  updateAdminMenuItem,
  updateAdminMenuProductOrderByCategory,
  uploadAdminMenuImage,
} from "@/lib/api/adminMenuCatalog";
import { createAdminCustomer, deleteAdminCustomer, listAdminCustomers, updateAdminCustomer } from "@/lib/api/adminCustomers";
import {
  getAdminBrandingSettings,
  getAdminStorefrontAnnouncementSettings,
  updateAdminBrandingSettings,
  updateAdminStorefrontAnnouncementSettings,
  uploadAdminBrandingLogo,
} from "@/lib/api/adminSettings";
import { useTenant } from "@/lib/TenantContext";
import html2canvas from "html2canvas";

const ADMIN_ACTIVE_TAB_STORAGE_KEY = "admin_dashboard_active_tab_v1";
const ADMIN_DEFAULT_LOGO_URL =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png";

const NAV_ITEMS = [
  { id: "orders", label: "Commandes", icon: "🛒" },
  { id: "menu", label: "Menu", icon: "🍽️" },
  { id: "reservations", label: "Réservations", icon: "📅" },
  { id: "customers", label: "Clients", icon: "👥" },
  { id: "marketing", label: "Marketing", icon: "📢" },
  { id: "announcement", label: "Annonce", icon: "📣" },
  { id: "analytics", label: "Analytiques", icon: "📊" },
  { id: "settings", label: "Réglages", icon: "⚙️" },
];

function AdminNotice({ type = "success", children }) {
  const styles = type === "error"
    ? "bg-red-50 border-red-200 text-red-700"
    : type === "info"
      ? "bg-blue-50 border-blue-200 text-blue-700"
      : "bg-green-50 border-green-200 text-green-700";
  return <div className={`mb-4 border px-4 py-3 rounded-lg text-sm ${styles}`}>{children}</div>;
}

function AdminLoadingState({ label = "Chargement..." }) {
  return <div className="text-center text-gray-400 py-12">{label}</div>;
}

function AdminEmptyState({ label }) {
  return <div className="text-center text-gray-400 py-12 border border-dashed border-gray-200 rounded-xl bg-white">{label}</div>;
}

function AdminAnnouncementPreview({ message, active }) {
  const trimmedMessage = typeof message === "string" ? message.trim() : "";

  if (!trimmedMessage) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
        Ajoutez un message pour voir l’aperçu du bandeau public.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#ead7d0] bg-gradient-to-r from-[#fff8f5] via-white to-[#fff8f5] px-4 py-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#e7c8bd] bg-white text-base">
          📣
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#9a5b49]">Storefront</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${active ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
              {active ? "Actif" : "Inactif"}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">{trimmedMessage}</p>
        </div>
      </div>
    </div>
  );
}

function AdminAnnouncement() {
  const [announcementSettings, setAnnouncementSettings] = useState(null);
  const [announcementSuccess, setAnnouncementSuccess] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  useEffect(() => {
    loadAnnouncement();
  }, []);

  const loadAnnouncement = async () => {
    setAnnouncementError("");
    try {
      const data = await getAdminStorefrontAnnouncementSettings();
      setAnnouncementSettings(data);
    } catch (e) {
      setAnnouncementError(e.message || "Impossible de charger l’annonce storefront.");
      setAnnouncementSettings({ active: false, message: "" });
    }
  };

  const handleSaveAnnouncement = async () => {
    setAnnouncementLoading(true);
    setAnnouncementError("");
    try {
      const updated = await updateAdminStorefrontAnnouncementSettings({
        active: announcementSettings.active,
        message: announcementSettings.message || "",
      });
      setAnnouncementSettings(updated);
      setAnnouncementSuccess("Annonce storefront sauvegardée.");
      setTimeout(() => setAnnouncementSuccess(""), 3000);
    } catch (e) {
      setAnnouncementError(e.message || "Impossible de sauvegarder l’annonce storefront.");
    } finally {
      setAnnouncementLoading(false);
    }
  };

  if (!announcementSettings) return <AdminLoadingState />;

  const trimmedMessage = (announcementSettings.message || "").trim();

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
        <div className="space-y-2">
          <div>
            <span className="inline-flex items-center rounded-full bg-[#f7ebe7] px-3 py-1 text-xs font-medium text-[#9a5b49]">
              Storefront public
            </span>
          </div>
          <div>
            <h3 className="font-semibold text-lg text-gray-900">Annonce storefront</h3>
            <p className="text-sm text-gray-500 mt-1">
              Publiez un message temporaire visible sur le storefront public. Lorsque l’annonce est inactive ou vide, rien n’est affiché côté client.
            </p>
          </div>
        </div>

        {announcementSuccess && <AdminNotice>{announcementSuccess}</AdminNotice>}
        {announcementError && <AdminNotice type="error">{announcementError}</AdminNotice>}

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="space-y-4">
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-3">Visibilité</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAnnouncementSettings((current) => ({ ...current, active: true }))}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${announcementSettings.active === true ? "border-[#b5122a] bg-[#fff5f7] text-[#8f0e21]" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:text-gray-900"}`}
                >
                  <div className="font-medium">Active</div>
                  <div className="mt-1 text-xs">Le bandeau est visible sur le storefront.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setAnnouncementSettings((current) => ({ ...current, active: false }))}
                  className={`rounded-xl border px-4 py-3 text-left transition-colors ${announcementSettings.active === false ? "border-gray-900 bg-gray-100 text-gray-900" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:text-gray-900"}`}
                >
                  <div className="font-medium">Inactive</div>
                  <div className="mt-1 text-xs">Aucune annonce n’est affichée au public.</div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Message affiché au public</label>
              <textarea
                rows={5}
                maxLength={280}
                value={announcementSettings.message || ""}
                onChange={(e) => setAnnouncementSettings((current) => ({ ...current, message: e.target.value }))}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-3 rounded-xl focus:outline-none focus:border-gray-400 resize-none"
                placeholder="Exemple : Fermé exceptionnellement le lundi 1er janvier. Merci de votre compréhension."
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
                <p>Ce texte apparaît en haut du storefront public. Gardez-le court, clair et facile à lire sur mobile.</p>
                <span>{(announcementSettings.message || "").length}/280 caractères</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Aperçu</p>
            <div className="mt-3">
              <AdminAnnouncementPreview message={trimmedMessage} active={announcementSettings.active === true} />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-500">
            {announcementSettings.active === true
              ? trimmedMessage
                ? "L’annonce sera affichée au public après sauvegarde."
                : "Ajoutez un message pour publier une annonce active."
              : "Le storefront n’affichera aucun bandeau tant que l’annonce reste inactive."}
          </p>
          <button
            onClick={handleSaveAnnouncement}
            disabled={announcementLoading}
            className="w-full sm:w-auto px-6 py-3 bg-[#b5122a] text-white font-semibold rounded-lg hover:bg-[#8f0e21] disabled:opacity-60 transition-colors"
          >
            {announcementLoading ? "Sauvegarde..." : "Sauvegarder l’annonce"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  recordAdminLoginDiagnostic("dashboard_rendered");
  const [admin, setAdmin] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    try {
      const persisted = window.localStorage.getItem(ADMIN_ACTIVE_TAB_STORAGE_KEY);
      if (persisted === "devices") return "settings";
      if (persisted && NAV_ITEMS.some((item) => item.id === persisted)) return persisted;
    } catch {
      // ignore storage errors
    }
    return "orders";
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    try {
      window.localStorage.setItem(ADMIN_ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch {
      // ignore storage errors
    }
  }, [activeTab]);

  useEffect(() => {
    let cancelled = false;
    recordAdminLoginDiagnostic("dashboard_bootstrap_started");

    async function bootstrapAdmin() {
      const stored = getStoredAdminSession();
      recordAdminLoginDiagnostic("dashboard_session_loaded", {
        hasToken: Boolean(stored?.token),
        adminId: stored?.admin?.id || null,
      });
      if (!stored?.token) {
        clearStoredAdminSession();
        recordAdminLoginDiagnostic("dashboard_missing_token_redirect", {
          to: createPageUrl("AdminLogin"),
        });
        window.location.href = createPageUrl("AdminLogin");
        return;
      }

      try {
        recordAdminLoginDiagnostic("dashboard_me_request_started");
        const resp = await backendClient.request('/admin/auth/me', {
          headers: {
            Authorization: `Bearer ${stored.token}`,
          },
        });
        recordAdminLoginDiagnostic("dashboard_me_request_succeeded", {
          adminId: resp?.data?.admin?.id || stored?.admin?.id || null,
        });

        if (!cancelled) {
          setAdmin({
            token: stored.token,
            ...(resp.data?.admin || stored.admin || {}),
          });
        }
      } catch (error) {
        recordAdminLoginDiagnostic("dashboard_me_request_failed", {
          message: error?.message || "REQUEST_FAILED",
          code: error?.code || null,
        });
        clearStoredAdminSession();
        if (!cancelled) {
          window.location.href = createPageUrl("AdminLogin");
        }
      }
    }

    bootstrapAdmin();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = () => {
    clearStoredAdminSession();
    window.location.href = createPageUrl("AdminLogin");
  };

  if (!admin) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="p-6 border-b border-gray-200">
          <img src={ADMIN_DEFAULT_LOGO_URL} alt="" className="w-28 mb-3" />
          <p className="text-gray-900 font-semibold">Administration</p>
          <p className="text-gray-500 text-sm">{admin.name || admin.username}</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors ${activeTab === item.id ? "bg-[#b5122a] text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
            >
              <span>{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-gray-200">
          <button onClick={handleLogout} className="w-full px-4 py-2 text-gray-500 hover:text-gray-900 text-sm transition-colors text-left">
            Se déconnecter
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 lg:px-6 py-4 flex items-center gap-4">
          <button className="lg:hidden text-gray-500 hover:text-gray-900" onClick={() => setSidebarOpen(true)}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-semibold capitalize text-gray-900">
            {NAV_ITEMS.find(n => n.id === activeTab)?.label}
          </h1>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {activeTab === "orders" && <AdminOrders />}
          {activeTab === "menu" && <AdminMenu />}
          {activeTab === "reservations" && <AdminReservations />}
          {activeTab === "customers" && <AdminCustomers />}
          {activeTab === "marketing" && <AdminMarketing />}
          {activeTab === "announcement" && <AdminAnnouncement />}
          {activeTab === "analytics" && <AdminAnalytics />}
          {activeTab === "settings" && <AdminSettings />}
        </main>
      </div>
    </div>
  );
}

function AdminMenuQrCard() {
  const { tenant } = useTenant();
  const [menuUrl, setMenuUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [isDownloadingCard, setIsDownloadingCard] = useState(false);
  const [hasLogoLoadError, setHasLogoLoadError] = useState(false);
  const cardRef = useRef(null);
  const qrImageUrl = menuUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=320x320&format=png&margin=20&data=${encodeURIComponent(menuUrl)}`
    : "";

  const restaurantName = useMemo(() => {
    const sourceName = (tenant?.name || "Restaurant").trim();
    const sanitized = sourceName
      .replace(/\s*\(\s*local\s*\)\s*$/i, "")
      .replace(/\s*-\s*local\s*$/i, "")
      .replace(/\s+local\s*$/i, "")
      .trim();
    return sanitized || sourceName;
  }, [tenant?.name]);
  const resolveRestaurantLogoUrl = (tenantConfig) => {
    if (!tenantConfig || typeof tenantConfig !== "object") return "";

    const branding = tenantConfig?.branding && typeof tenantConfig.branding === "object"
      ? tenantConfig.branding
      : null;

    const candidates = [
      branding?.logoUrl,
      branding?.logo_url,
      branding?.logo,
      tenantConfig?.logoUrl,
      tenantConfig?.logo_url,
      tenantConfig?.logo,
      ADMIN_DEFAULT_LOGO_URL,
    ];

    const firstValid = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
    return firstValid ? firstValid.trim() : "";
  };

  const resolvedLogoUrl = useMemo(() => resolveRestaurantLogoUrl(tenant), [tenant]);
  const shouldShowLogo = Boolean(resolvedLogoUrl) && !hasLogoLoadError;
  const fallbackInitial = (restaurantName || "R").charAt(0).toUpperCase();

  useEffect(() => {
    setHasLogoLoadError(false);
  }, [resolvedLogoUrl]);

  const handleLogoError = () => {
    setHasLogoLoadError(true);
  };

  const generateMenuUrl = () => {
    if (typeof window === "undefined") return;
    setMenuUrl(`${window.location.origin}${createPageUrl("Menu")}?mode=menu-only`);
    setCopied(false);
    setDownloadError("");
  };

  const copyMenuUrl = async () => {
    if (!menuUrl) return;
    try {
      await navigator.clipboard.writeText(menuUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const downloadQrPng = async () => {
    if (!qrImageUrl) return;
    const response = await fetch(qrImageUrl);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "qr-menu-alalouche.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadStyledCardPng = async () => {
    if (!cardRef.current || !menuUrl) return;

    setIsDownloadingCard(true);
    setDownloadError("");

    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const pngUrl = canvas.toDataURL("image/png");
      const anchor = document.createElement("a");
      anchor.href = pngUrl;
      anchor.download = "carte-menu-table.png";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      setDownloadError("Impossible de télécharger la carte stylisée pour le moment.");
    } finally {
      setIsDownloadingCard(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-lg text-gray-900">QR Menu</h3>
      <p className="text-sm text-gray-500">
        Générez un QR pour <span className="font-medium">voir le menu uniquement</span>. Les clients ne peuvent pas commander dans ce mode.
      </p>

      <div className="flex flex-wrap gap-2">
        <button onClick={generateMenuUrl} className="px-4 py-2 bg-[#b5122a] text-white rounded-lg hover:bg-[#8f0e21]">
          Générer
        </button>
        <button onClick={copyMenuUrl} disabled={!menuUrl} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg disabled:opacity-50">
          {copied ? "Lien copié" : "Copier le lien"}
        </button>
        <button onClick={downloadStyledCardPng} disabled={!menuUrl || isDownloadingCard} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg disabled:opacity-50">
          {isDownloadingCard ? "Téléchargement..." : "Télécharger la carte"}
        </button>
        <button onClick={downloadQrPng} disabled={!menuUrl} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg disabled:opacity-50">
          Télécharger le QR
        </button>
      </div>

      {downloadError && <p className="text-sm text-red-600">{downloadError}</p>}

      {menuUrl && (
        <>
          <div className="text-xs text-gray-500 break-all bg-gray-50 border border-gray-200 rounded p-2">{menuUrl}</div>
          <div>
            <p className="text-sm font-medium text-gray-800 mb-2">Aperçu carte de table</p>
            <div className="inline-flex p-4 bg-gray-100 rounded-2xl border border-gray-200">
              <div
                ref={cardRef}
                className="w-[300px] bg-white border border-gray-200 rounded-2xl px-6 py-6 text-center shadow-sm"
              >
                <div className="flex flex-col items-center mb-5">
                  {shouldShowLogo ? (
                    <div className="w-24 h-20 mb-2 flex items-center justify-center">
                      <img
                        src={resolvedLogoUrl}
                        alt={restaurantName}
                        crossOrigin="anonymous"
                        onError={handleLogoError}
                        className="w-full h-full object-contain object-center"
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-lg font-semibold text-gray-600 mb-2">
                      {fallbackInitial}
                    </div>
                  )}
                  <h4 className="text-base font-semibold text-gray-900">{restaurantName}</h4>
                </div>

                <div className="mx-auto w-[210px] h-[210px] border border-gray-200 rounded-xl bg-white p-3">
                  <img
                    src={qrImageUrl}
                    alt="QR Menu"
                    crossOrigin="anonymous"
                    className="w-full h-full rounded-md"
                  />
                </div>

                <p className="mt-4 text-[18px] font-semibold text-gray-900">Scannez pour voir le menu</p>
                <p className="mt-2 text-sm text-gray-500">Menu digital à consulter sur votre téléphone</p>
                <p className="mt-1 text-xs text-gray-400">Navigation en mode menu uniquement</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Orders Panel ─────────────────────────────────────────────────────────────
function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [kpis, setKpis] = useState(null);
  const [showHidden, setShowHidden] = useState(false);
  const [pendingOrderActionId, setPendingOrderActionId] = useState("");

  const normalizeOrder = (order) => {
    const payload = order?.payload && typeof order.payload === 'object' ? order.payload : {};
    return {
      ...order,
      order_number: order.orderNumber,
      customer_name: order.customerName,
      customer_email: order.customerEmail,
      customer_phone: payload.customerPhone || null,
      customer_address: payload.customerAddress || null,
      order_type: payload.orderType || 'takeaway',
      payment_method: payload.paymentMethod || 'cash',
      total_amount: Number(order.totalAmount || 0),
      items: Array.isArray(payload.items) ? payload.items : [],
      notes: payload.notes || null,
      created_date: order.createdAt,
      prep_time_minutes: order.prepMinutes,
      admin_hidden_at: order.adminHiddenAt || null,
    };
  };

  const loadOrders = async (nextShowHidden = showHidden) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const data = await listAdminOrders({ includeHidden: nextShowHidden });
      setOrders(data.map(normalizeOrder));
    } catch (error) {
      setErrorMsg(error.message || 'Impossible de charger les commandes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders(showHidden);
    loadKpis();
  }, [showHidden]);

  const loadKpis = async () => {
    try {
      const data = await getAdminKpis();
      setKpis(data);
    } catch {
      setKpis(null);
    }
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const setPrepTime = async (order, minutes) => {
    await updateAdminOrderStatus(order.id, { status: 'accepted', prepMinutes: minutes });
    showSuccess(`Commande acceptée — prête dans ${minutes} min`);
    await Promise.all([loadOrders(showHidden), loadKpis()]);
  };

  const updateStatus = async (order, status) => {
    await updateAdminOrderStatus(order.id, { status });
    const labels = { ready: 'Commande marquée comme prête ✓', completed: 'Commande terminée ✓' };
    showSuccess(labels[status] || 'Statut mis à jour ✓');
    await Promise.all([loadOrders(showHidden), loadKpis()]);
  };

  const toggleOrderVisibility = async (order) => {
    const isHidden = Boolean(order.admin_hidden_at);
    const confirmationMessage = isHidden
      ? `Réafficher la commande ${order.order_number} dans la vue principale ?`
      : `Masquer la commande ${order.order_number} de la vue principale ?`;
    if (!window.confirm(confirmationMessage)) return;

    setPendingOrderActionId(order.id);
    setErrorMsg('');
    try {
      if (isHidden) {
        await restoreAdminOrder(order.id);
        showSuccess('Commande réaffichée dans la vue admin ✓');
      } else {
        await hideAdminOrder(order.id);
        if (selectedOrder?.id === order.id) setSelectedOrder(null);
        showSuccess('Commande masquée de la vue admin ✓');
      }
      await loadOrders(showHidden);
    } catch (error) {
      setErrorMsg(error.message || 'Impossible de mettre à jour la visibilité de la commande.');
    } finally {
      setPendingOrderActionId('');
    }
  };

  const STATUS_COLORS = { new: "bg-yellow-500", accepted: "bg-blue-500", ready: "bg-green-500", completed: "bg-gray-400", cancelled: "bg-red-500" };
  const STATUS_LABELS = { new: "Nouveau", accepted: "Accepté", ready: "Prêt", completed: "Terminé", cancelled: "Annulé" };

  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  return (
    <div>
      {successMsg && <AdminNotice>{successMsg}</AdminNotice>}
      {errorMsg && <AdminNotice type="error">{errorMsg}</AdminNotice>}

      {kpis && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Commandes (jour)</div>
            <div className="text-2xl font-bold text-gray-900">{kpis.orderCount}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">Réservations (jour)</div>
            <div className="text-2xl font-bold text-gray-900">{kpis.reservationCount}</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="text-xs text-gray-500">CA (jour)</div>
            <div className="text-2xl font-bold text-gray-900">CHF {Number(kpis.dailyTurnover || 0).toFixed(2)}</div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {["all", "new", "accepted", "ready", "completed"].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${filter === f ? "bg-[#b5122a] text-white" : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900"}`}>
              {f === "all" ? "Toutes" : STATUS_LABELS[f]}
              {f === "new" && orders.filter(o => o.status === "new").length > 0 && (
                <span className="ml-1 bg-yellow-500 text-black text-xs rounded-full px-1.5">{orders.filter(o => o.status === "new").length}</span>
              )}
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowHidden((current) => !current)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showHidden ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900"}`}
        >
          {showHidden ? "Masqués visibles" : "Afficher les masqués"}
        </button>
      </div>

      {loading ? (
        <AdminLoadingState />
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <div key={order.id} className={`bg-white rounded-xl border p-5 shadow-sm ${order.status === "new" ? "border-yellow-400" : "border-gray-200"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[order.status]}`} />
                    <span className="font-semibold text-gray-900">{order.order_number}</span>
                    <span className="text-gray-500 text-sm">— {order.customer_name}</span>
                  </div>
                  <div className="text-gray-500 text-sm">
                    {order.order_type === "takeaway" ? "À emporter" : "Livraison"} · {order.payment_method === "cash" ? "Espèces" : "Carte"} · CHF {order.total_amount?.toFixed(2)}
                  </div>
                  <div className="text-gray-400 text-xs mt-1">
                    {order.customer_phone && <span>{order.customer_phone}</span>}
                    {order.created_date && (
                      <span className="ml-2">· Reçu à {formatTime(order.created_date)} ({formatDate(order.created_date)})</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[order.status]} text-white`}>{STATUS_LABELS[order.status]}</span>
                  {order.admin_hidden_at && (
                    <span className="px-2 py-1 rounded text-xs font-medium border border-gray-200 bg-gray-100 text-gray-600">Masquée</span>
                  )}
                  <button
                    onClick={() => toggleOrderVisibility(order)}
                    disabled={pendingOrderActionId === order.id}
                    className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2 py-1 rounded disabled:opacity-60"
                  >
                    {pendingOrderActionId === order.id ? '...' : order.admin_hidden_at ? 'Réafficher' : 'Masquer'}
                  </button>
                  <button onClick={() => setSelectedOrder(selectedOrder?.id === order.id ? null : order)}
                    className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2 py-1 rounded">
                    {selectedOrder?.id === order.id ? "Fermer" : "Détails"}
                  </button>
                </div>
              </div>

              {order.status === "new" && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-yellow-700 text-sm mb-2 font-medium">⚠️ Sélectionner le temps de préparation</p>
                  <div className="flex gap-2 flex-wrap">
                    {[15, 30, 45, 60].map(mins => (
                      <button key={mins} onClick={() => setPrepTime(order, mins)}
                        className="px-4 py-2 bg-yellow-500 text-black font-bold rounded hover:bg-yellow-400 transition-colors text-sm">
                        {mins} min
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {order.status === "accepted" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
                  <p className="text-blue-700 text-sm">En préparation {order.prep_time_minutes && <span className="ml-2 text-gray-400">({order.prep_time_minutes} min)</span>}</p>
                  <button onClick={() => updateStatus(order, "ready")}
                    className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-500">
                    Marquer prêt
                  </button>
                </div>
              )}

              {selectedOrder?.id === order.id && (
                <div className="mt-4 border-t border-gray-100 pt-4 space-y-3 text-sm">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <p className="font-medium text-gray-900 mb-2">Articles</p>
                      {order.items?.map((item, i) => (
                        <div key={i} className="py-1">
                          <div className="flex justify-between text-gray-600">
                            <span>{item.name} x{item.quantity}</span>
                            <span>CHF {(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                          {Array.isArray(item.selectedOptions) && item.selectedOptions.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {item.selectedOptions.map((option, optionIndex) => (
                                <p key={`${option.groupName}-${option.optionLabel}-${optionIndex}`} className="text-xs text-gray-400">
                                  {option.groupName}: {option.optionLabel}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <div className="border-t border-gray-100 mt-2 pt-2 flex justify-between font-bold text-gray-900">
                        <span>Total</span>
                        <span>CHF {order.total_amount?.toFixed(2)}</span>
                      </div>
                    </div>
                    <div>
                      {order.customer_address && <p className="text-gray-600"><span className="text-gray-400">Adresse: </span>{order.customer_address}</p>}
                      {order.notes && <p className="text-gray-600 mt-1"><span className="text-gray-400">Notes: </span>{order.notes}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    {order.status === "ready" && (
                      <button onClick={() => updateStatus(order, "completed")}
                        className="px-4 py-2 bg-gray-600 text-white rounded text-sm hover:bg-gray-500">
                        Terminer
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && <AdminEmptyState label="Aucune commande pour ce filtre." />} 
        </div>
      )}
    </div>
  );
}

// ─── Menu Panel ───────────────────────────────────────────────────────────────
function AdminMenu() {
  const [items, setItems] = useState([]);
  const [categoryOrder, setCategoryOrder] = useState([]);
  const [productOrderByCategory, setProductOrderByCategory] = useState({});
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "", imageUrl: "", available: true, allergens: "", optionGroups: [] });
  const [selectedCategory, setSelectedCategory] = useState("__new_category__");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState({ type: "", message: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const NEW_CATEGORY_OPTION = "__new_category__";
  const discoveredCategories = useMemo(() => {
    const dynamicCategories = items
      .map((item) => (typeof item.category === "string" ? item.category.trim() : ""))
      .filter(Boolean);
    const currentFormCategory = typeof form.category === "string" ? form.category.trim() : "";
    return Array.from(new Set([...categoryOrder, ...dynamicCategories, currentFormCategory].filter(Boolean)));
  }, [items, form.category, categoryOrder]);
  const categoryOptions = useMemo(() => {
    if (!Array.isArray(categoryOrder) || categoryOrder.length === 0) {
      return discoveredCategories;
    }
    const ordered = categoryOrder.filter((category) => discoveredCategories.includes(category));
    const remaining = discoveredCategories.filter((category) => !ordered.includes(category));
    return [...ordered, ...remaining];
  }, [categoryOrder, discoveredCategories]);

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", category: "", imageUrl: "", available: true, allergens: "", optionGroups: [] });
    setSelectedCategory(categoryOptions[0] || NEW_CATEGORY_OPTION);
    setNewCategoryName("");
    setUploadFeedback({ type: "", message: "" });
  };

  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, order, byCategory] = await Promise.all([
        listAdminMenuCatalog(),
        getAdminMenuCategoryOrder(),
        getAdminMenuProductOrderByCategory(),
      ]);
      setItems(data);
      setCategoryOrder(order);
      setProductOrderByCategory(byCategory);
    } catch (e) {
      setError(e.message || "Impossible de charger le catalogue menu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  useEffect(() => {
    if (selectedCategory === NEW_CATEGORY_OPTION) return;
    if (!selectedCategory || !categoryOptions.includes(selectedCategory)) {
      setSelectedCategory(categoryOptions[0] || NEW_CATEGORY_OPTION);
    }
  }, [categoryOptions, selectedCategory]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const resolvedCategory = selectedCategory === NEW_CATEGORY_OPTION ? newCategoryName.trim() : selectedCategory;
    if (!resolvedCategory) {
      setSaving(false);
      setError("Veuillez sélectionner une catégorie ou saisir une nouvelle catégorie.");
      return;
    }

    const payload = {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      category: resolvedCategory,
      imageUrl: form.imageUrl,
      available: form.available,
      allergens: form.allergens,
      optionGroups: Array.isArray(form.optionGroups) ? form.optionGroups : [],
    };

    try {
      if (editing) {
        const updated = await updateAdminMenuItem(editing.id, payload);
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setSuccess("Article modifié avec succès !");
      } else {
        const created = await createAdminMenuItem(payload);
        setItems((prev) => [...prev, created]);
        setSuccess("Article ajouté avec succès !");
      }
      resetForm();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Impossible d'enregistrer l'article.");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setUploadingImage(true);
    setError("");
    setUploadFeedback({ type: "info", message: `Upload de ${selectedFile.name} en cours...` });

    try {
      const uploaded = await uploadAdminMenuImage(selectedFile);
      setForm((prev) => ({ ...prev, imageUrl: uploaded.imageUrl || "" }));
      setUploadFeedback({ type: "success", message: `Image uploadée : ${selectedFile.name}` });
      setSuccess("Image uploadée avec succès.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (uploadError) {
      setUploadFeedback({ type: "error", message: uploadError.message || "Impossible d'uploader l'image." });
      setError(uploadError.message || "Impossible d'uploader l'image.");
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleEdit = (item) => {
    setEditing(item);
    setUploadFeedback({ type: "", message: "" });
    setSelectedCategory(item.category);
    setNewCategoryName("");
    setForm({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      category: item.category,
      imageUrl: item.imageUrl || "",
      available: item.available !== false,
      allergens: item.allergens || "",
      optionGroups: Array.isArray(item.optionGroups) ? item.optionGroups : [],
    });
  };

  const addOptionGroup = () => {
    setForm((prev) => ({
      ...prev,
      optionGroups: [
        ...(Array.isArray(prev.optionGroups) ? prev.optionGroups : []),
        {
          id: `group_${Date.now()}`,
          name: "",
          selectionType: "single",
          required: false,
          options: [{ id: `opt_${Date.now()}`, label: "", priceDelta: 0 }],
        },
      ],
    }));
  };

  const updateOptionGroup = (groupIndex, updater) => {
    setForm((prev) => {
      const groups = Array.isArray(prev.optionGroups) ? [...prev.optionGroups] : [];
      groups[groupIndex] = updater(groups[groupIndex] || {});
      return { ...prev, optionGroups: groups };
    });
  };

  const removeOptionGroup = (groupIndex) => {
    setForm((prev) => {
      const groups = Array.isArray(prev.optionGroups) ? [...prev.optionGroups] : [];
      groups.splice(groupIndex, 1);
      return { ...prev, optionGroups: groups };
    });
  };

  const handleDelete = async (id) => {
    if (!confirm("Supprimer cet article du menu ? Cette action est irréversible.")) return;

    setError("");
    try {
      await deleteAdminMenuItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      setSuccess("Article supprimé avec succès.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Impossible de supprimer l'article.");
    }
  };

  const toggleAvailable = async (item) => {
    setError("");
    try {
      const updated = await updateAdminMenuItem(item.id, { available: !(item.available !== false) });
      setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setSuccess(`Disponibilité mise à jour : ${updated.available !== false ? "article activé" : "article désactivé"}.`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Impossible de modifier la disponibilité.");
    }
  };

  const persistCategoryOrder = async (nextOrder) => {
    const saved = await updateAdminMenuCategoryOrder(nextOrder);
    setCategoryOrder(saved);
  };

  const getOrderedItemsForCategory = (category) => {
    const categoryItems = items.filter((item) => item.category === category);
    const configuredOrder = Array.isArray(productOrderByCategory?.[category])
      ? productOrderByCategory[category]
      : [];
    if (configuredOrder.length === 0) return categoryItems;

    const indexById = new Map(configuredOrder.map((id, index) => [id, index]));
    return [...categoryItems].sort((a, b) => {
      const aIndex = indexById.has(a.id) ? indexById.get(a.id) : Number.POSITIVE_INFINITY;
      const bIndex = indexById.has(b.id) ? indexById.get(b.id) : Number.POSITIVE_INFINITY;
      if (aIndex !== bIndex) return aIndex - bIndex;
      return 0;
    });
  };

  const moveProductInCategory = async (category, productId, direction) => {
    const orderedItems = getOrderedItemsForCategory(category);
    const currentIndex = orderedItems.findIndex((item) => item.id === productId);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= orderedItems.length) return;

    const nextOrderIds = orderedItems.map((item) => item.id);
    [nextOrderIds[currentIndex], nextOrderIds[targetIndex]] = [nextOrderIds[targetIndex], nextOrderIds[currentIndex]];

    const nextMap = {
      ...(productOrderByCategory || {}),
      [category]: nextOrderIds,
    };

    try {
      const saved = await updateAdminMenuProductOrderByCategory(nextMap);
      setProductOrderByCategory(saved);
      setSuccess(`Ordre des produits enregistré pour "${category}".`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Impossible de modifier l'ordre des produits.");
    }
  };

  const moveCategory = async (category, direction) => {
    const baseOrder = categoryOptions;
    const index = baseOrder.indexOf(category);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= baseOrder.length) return;
    const nextOrder = [...baseOrder];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    try {
      await persistCategoryOrder(nextOrder);
      setSuccess("Ordre des catégories enregistré.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Impossible de modifier l'ordre des catégories.");
    }
  };

  const handleDeleteCategory = async (category) => {
    const affectedCount = items.filter((item) => item.category === category).length;
    const confirmed = confirm(`Supprimer la catégorie "${category}" ? ${affectedCount} article(s) seront impactés.`);
    if (!confirmed) return;

    const replacement = prompt(
      `Catégorie de remplacement pour ${affectedCount} article(s). Laissez vide pour déplacer vers "Autres" :`,
      "",
    );
    if (replacement === null) return;
    const targetCategory = replacement.trim();
    const clearCategory = targetCategory.length === 0;

    try {
      const result = await deleteAdminMenuCategory({
        category,
        ...(targetCategory ? { targetCategory } : {}),
        clearCategory,
      });
      setItems(result.items || []);
      setCategoryOrder(Array.isArray(result.categoryOrder) ? result.categoryOrder : []);
      if (selectedCategory === category) {
        setSelectedCategory((Array.isArray(result.categoryOrder) && result.categoryOrder[0]) || NEW_CATEGORY_OPTION);
      }
      setSuccess(`Catégorie supprimée. ${result.affectedCount || 0} article(s) mis à jour.`);
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Impossible de supprimer la catégorie.");
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h2 className="font-semibold text-lg mb-5 text-gray-900">{editing ? "Modifier l'article" : "Ajouter un article"}</h2>
        {success && <AdminNotice>{success}</AdminNotice>}
        {error && <AdminNotice type="error">{error}</AdminNotice>}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-gray-500 mb-1">Nom *</label>
              <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Prix (CHF) *</label>
              <input required type="number" min="0" step="0.5" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400" />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Catégorie</label>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  const nextCategory = e.target.value;
                  setSelectedCategory(nextCategory);
                  if (nextCategory !== NEW_CATEGORY_OPTION) {
                    setNewCategoryName("");
                    setForm((prev) => ({ ...prev, category: nextCategory }));
                  }
                }}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400"
              >
                {categoryOptions.length === 0 && (
                  <option value="" disabled>Aucune catégorie existante</option>
                )}
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value={NEW_CATEGORY_OPTION}>+ Nouvelle catégorie</option>
              </select>
              {selectedCategory === NEW_CATEGORY_OPTION && (
                <input
                  value={newCategoryName}
                  onChange={(e) => {
                    const nextCategoryName = e.target.value;
                    setNewCategoryName(nextCategoryName);
                    setForm((prev) => ({ ...prev, category: nextCategoryName }));
                  }}
                  className="mt-2 w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                  placeholder="Saisir la nouvelle catégorie"
                />
              )}
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-500 mb-1">Description</label>
              <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-500 mb-1">Image {form.imageUrl ? '(remplacer)' : ''}</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleImageUpload}
                disabled={uploadingImage}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400 file:mr-3 file:rounded file:border-0 file:bg-gray-200 file:px-2 file:py-1 file:text-gray-700"
              />
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, WEBP ou GIF (max 5 MB par défaut).</p>
              {uploadFeedback.message && (
                <p className={`mt-2 text-sm ${uploadFeedback.type === "error" ? "text-red-600" : uploadFeedback.type === "success" ? "text-green-600" : "text-gray-500"}`}>
                  {uploadFeedback.message}
                </p>
              )}
              <label className="block text-sm text-gray-500 mt-3 mb-1">URL image (optionnel, remplacement manuel)</label>
              <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400" placeholder="https://..." />
              {form.imageUrl && (
                <div className="mt-2 flex items-start gap-3 p-2 border border-gray-200 rounded-lg bg-gray-50">
                  <img src={form.imageUrl} alt="Aperçu" className="w-20 h-20 object-cover rounded border border-gray-200" />
                  <div className="text-xs text-gray-500 space-y-2">
                    <p className="break-all">{form.imageUrl}</p>
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, imageUrl: "" }))}
                      className="text-red-600 hover:text-red-700 underline"
                    >
                      Retirer l'image
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-500 mb-1">Allergènes</label>
              <input value={form.allergens} onChange={e => setForm({ ...form, allergens: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400" placeholder="Gluten, lactose..." />
            </div>
            <div className="col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <label className="block text-sm text-gray-500">Options de personnalisation</label>
                <button type="button" onClick={addOptionGroup} className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-100">
                  + Groupe
                </button>
              </div>
              <div className="space-y-3">
                {(Array.isArray(form.optionGroups) ? form.optionGroups : []).map((group, groupIndex) => (
                  <div key={group.id || groupIndex} className="rounded-lg border border-gray-200 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={group.name || ""}
                        onChange={(e) => updateOptionGroup(groupIndex, (current) => ({ ...current, name: e.target.value }))}
                        className="flex-1 bg-gray-50 border border-gray-200 text-gray-900 px-2 py-1.5 rounded focus:outline-none focus:border-gray-400"
                        placeholder="Nom du groupe (ex: Oignons)"
                      />
                      <select
                        value={group.selectionType === "multiple" ? "multiple" : "single"}
                        onChange={(e) => updateOptionGroup(groupIndex, (current) => ({ ...current, selectionType: e.target.value }))}
                        className="bg-gray-50 border border-gray-200 text-gray-900 px-2 py-1.5 rounded"
                      >
                        <option value="single">Choix unique</option>
                        <option value="multiple">Choix multiple</option>
                      </select>
                      <button type="button" onClick={() => removeOptionGroup(groupIndex)} className="text-xs border border-red-200 text-red-600 rounded px-2 py-1 hover:bg-red-50">Supprimer</button>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={group.required === true}
                        onChange={(e) => updateOptionGroup(groupIndex, (current) => ({ ...current, required: e.target.checked }))}
                      />
                      Obligatoire
                    </label>
                    <div className="space-y-2">
                      {(Array.isArray(group.options) ? group.options : []).map((option, optionIndex) => (
                        <div key={option.id || optionIndex} className="grid grid-cols-12 gap-2">
                          <input
                            value={option.label || ""}
                            onChange={(e) => updateOptionGroup(groupIndex, (current) => {
                              const options = Array.isArray(current.options) ? [...current.options] : [];
                              options[optionIndex] = { ...(options[optionIndex] || {}), label: e.target.value };
                              return { ...current, options };
                            })}
                            className="col-span-8 bg-gray-50 border border-gray-200 text-gray-900 px-2 py-1.5 rounded"
                            placeholder="Libellé option"
                          />
                          <input
                            type="number"
                            step="0.5"
                            value={option.priceDelta ?? 0}
                            onChange={(e) => updateOptionGroup(groupIndex, (current) => {
                              const options = Array.isArray(current.options) ? [...current.options] : [];
                              options[optionIndex] = { ...(options[optionIndex] || {}), priceDelta: Number(e.target.value || 0) };
                              return { ...current, options };
                            })}
                            className="col-span-3 bg-gray-50 border border-gray-200 text-gray-900 px-2 py-1.5 rounded"
                          />
                          <button
                            type="button"
                            onClick={() => updateOptionGroup(groupIndex, (current) => {
                              const options = Array.isArray(current.options) ? [...current.options] : [];
                              options.splice(optionIndex, 1);
                              return { ...current, options };
                            })}
                            className="col-span-1 text-xs border border-gray-200 rounded px-2 py-1"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => updateOptionGroup(groupIndex, (current) => ({
                          ...current,
                          options: [...(Array.isArray(current.options) ? current.options : []), { id: `opt_${Date.now()}_${groupIndex}`, label: "", priceDelta: 0 }],
                        }))}
                        className="text-xs border border-gray-200 rounded px-2 py-1 hover:bg-gray-100"
                      >
                        + Option
                      </button>
                    </div>
                  </div>
                ))}
                {(Array.isArray(form.optionGroups) ? form.optionGroups : []).length === 0 && (
                  <p className="text-xs text-gray-400">Aucun groupe. Les options sont facultatives.</p>
                )}
              </div>
            </div>
            <div className="col-span-2 flex items-center gap-2">
              <input type="checkbox" id="available" checked={form.available} onChange={e => setForm({ ...form, available: e.target.checked })} className="w-4 h-4" />
              <label htmlFor="available" className="text-sm text-gray-500">Disponible</label>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving || uploadingImage}
              className="flex-1 py-2 bg-[#b5122a] text-white rounded-lg font-medium hover:bg-[#8f0e21] disabled:opacity-60 transition-colors">
              {saving ? "..." : uploadingImage ? "Upload image..." : editing ? "Modifier" : "Ajouter"}
            </button>
            {editing && (
              <button type="button" onClick={resetForm}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">
                Annuler
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="space-y-3">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <h3 className="font-medium text-gray-900 mb-3">Catégories</h3>
          <div className="space-y-2">
            {categoryOptions.map((category, index) => (
              <div key={category} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-700 truncate">{category}</span>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveCategory(category, "up")} disabled={index === 0} className="text-xs border border-gray-200 rounded px-2 py-1 disabled:opacity-40">↑</button>
                  <button type="button" onClick={() => moveCategory(category, "down")} disabled={index === categoryOptions.length - 1} className="text-xs border border-gray-200 rounded px-2 py-1 disabled:opacity-40">↓</button>
                  <button type="button" onClick={() => handleDeleteCategory(category)} className="text-xs border border-red-200 text-red-600 rounded px-2 py-1 hover:bg-red-50">Supprimer</button>
                </div>
              </div>
            ))}
            {categoryOptions.length === 0 && (
              <p className="text-sm text-gray-400">Aucune catégorie.</p>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <h3 className="font-medium text-gray-900 mb-3">Ordre des produits par catégorie</h3>
          <div className="space-y-4">
            {categoryOptions.map((category) => {
              const orderedItems = getOrderedItemsForCategory(category);
              return (
                <div key={`products-${category}`} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">{category}</p>
                  {orderedItems.length === 0 ? (
                    <p className="text-xs text-gray-400">Aucun article dans cette catégorie.</p>
                  ) : (
                    <div className="space-y-1">
                      {orderedItems.map((item, index) => (
                        <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-gray-100 px-2 py-1.5">
                          <span className="text-xs text-gray-600 truncate">{item.name}</span>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => moveProductInCategory(category, item.id, "up")} disabled={index === 0} className="text-xs border border-gray-200 rounded px-2 py-1 disabled:opacity-40">↑</button>
                            <button type="button" onClick={() => moveProductInCategory(category, item.id, "down")} disabled={index === orderedItems.length - 1} className="text-xs border border-gray-200 rounded px-2 py-1 disabled:opacity-40">↓</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {categoryOptions.length === 0 && (
              <p className="text-sm text-gray-400">Aucune catégorie.</p>
            )}
          </div>
        </div>
        <h2 className="font-semibold text-lg text-gray-900">Articles ({items.length})</h2>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {loading ? <AdminLoadingState /> : items.map(item => (
            <div key={item.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3 shadow-sm">
              {item.imageUrl && <img src={item.imageUrl} alt="" className="w-12 h-12 object-cover rounded flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium truncate text-gray-900">{item.name}</span>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.available !== false ? "bg-green-500" : "bg-gray-300"}`} />
                </div>
                <div className="text-gray-500 text-sm">{item.category} — CHF {Number(item.price || 0).toFixed(2)}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => toggleAvailable(item)} className="text-xs text-gray-500 hover:text-gray-900 border border-gray-200 px-2 py-1 rounded">
                  {item.available !== false ? "Désactiver" : "Activer"}
                </button>
                <button onClick={() => handleEdit(item)} className="text-xs text-blue-600 hover:text-blue-700 border border-gray-200 px-2 py-1 rounded">Éditer</button>
                <button onClick={() => handleDelete(item.id)} className="text-xs text-red-500 hover:text-red-600 border border-gray-200 px-2 py-1 rounded">Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Reservations Panel ───────────────────────────────────────────────────────
function AdminReservations() {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [pendingReservationActionId, setPendingReservationActionId] = useState("");

  const normalizeReservation = (reservation) => ({
    ...reservation,
    name: reservation.customerName,
    email: reservation.customerEmail,
    phone: reservation.customerPhone,
    guests: reservation.guestCount,
    date: formatDate(reservation.reservationDate),
    time: formatTime(reservation.reservationDate),
    created_date: reservation.createdAt,
    admin_hidden_at: reservation.adminHiddenAt || null,
  });

  const loadReservations = async (nextShowHidden = showHidden) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await listAdminReservations({ includeHidden: nextShowHidden });
      setReservations(data.map(normalizeReservation));
    } catch (error) {
      setErrorMsg(error.message || 'Impossible de charger les réservations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations(showHidden);
  }, [showHidden]);

  const updateStatus = async (r, status) => {
    try {
      const updated = await updateAdminReservationStatus(r.id, { status });
      setReservations(prev => prev.map(res => (res.id === r.id ? normalizeReservation(updated) : res)));
      setSuccessMsg(status === 'confirmed' ? 'Réservation confirmée ✓' : 'Réservation annulée ✓');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (error) {
      setErrorMsg(error.message || 'Impossible de mettre à jour la réservation.');
    }
  };

  const toggleReservationVisibility = async (reservation) => {
    const isHidden = Boolean(reservation.admin_hidden_at);
    const confirmationMessage = isHidden
      ? `Réafficher la réservation de ${reservation.name} dans la vue principale ?`
      : `Masquer la réservation de ${reservation.name} de la vue principale ?`;
    if (!window.confirm(confirmationMessage)) return;

    setPendingReservationActionId(reservation.id);
    setErrorMsg('');
    try {
      if (isHidden) {
        await restoreAdminReservation(reservation.id);
        setSuccessMsg('Réservation réaffichée dans la vue admin ✓');
      } else {
        await hideAdminReservation(reservation.id);
        setSuccessMsg('Réservation masquée de la vue admin ✓');
      }
      setTimeout(() => setSuccessMsg(''), 4000);
      await loadReservations(showHidden);
    } catch (error) {
      setErrorMsg(error.message || 'Impossible de mettre à jour la visibilité de la réservation.');
    } finally {
      setPendingReservationActionId('');
    }
  };

  const STATUS_COLORS = { pending: 'bg-yellow-500', confirmed: 'bg-green-500', cancelled: 'bg-red-500' };
  const STATUS_LABELS = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' };

  return (
    <div>
      {successMsg && <AdminNotice>{successMsg}</AdminNotice>}
      {errorMsg && <AdminNotice type="error">{errorMsg}</AdminNotice>}
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowHidden((current) => !current)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${showHidden ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:text-gray-900"}`}
        >
          {showHidden ? "Masquées visibles" : "Afficher les masquées"}
        </button>
      </div>
      <div className="space-y-3">
        {loading ? <AdminLoadingState /> :
          reservations.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <div className="font-semibold text-lg text-gray-900">{r.name}</div>
                  <div className="text-gray-500 text-sm">{r.date} à {r.time} — {r.guests} personne{r.guests > 1 ? 's' : ''}</div>
                  <div className="text-gray-400 text-sm mt-1">{r.email || 'email non renseigné'}</div>
                  <div className="text-gray-400 text-sm mt-1">{r.phone || 'téléphone non renseigné'}</div>
                  {r.created_date && <div className="text-gray-400 text-xs mt-1">Reçu le {formatDateFull(r.created_date)} à {formatTime(r.created_date)}</div>}
                  {r.notes && <div className="text-gray-500 text-sm mt-1 italic">"{r.notes}"</div>}
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`px-2 py-1 rounded text-xs font-medium text-white ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                  {r.admin_hidden_at && (
                    <span className="px-2 py-1 rounded text-xs font-medium border border-gray-200 bg-gray-100 text-gray-600">Masquée</span>
                  )}
                  <button
                    onClick={() => toggleReservationVisibility(r)}
                    disabled={pendingReservationActionId === r.id}
                    className="px-3 py-1 border border-gray-200 text-gray-600 rounded text-xs hover:text-gray-900 disabled:opacity-60"
                  >
                    {pendingReservationActionId === r.id ? '...' : r.admin_hidden_at ? 'Réafficher' : 'Masquer'}
                  </button>
                  {r.status === 'pending' && (
                    <>
                      <button onClick={() => updateStatus(r, 'confirmed')} className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-500">Confirmer</button>
                      <button onClick={() => updateStatus(r, 'cancelled')} className="px-3 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-500">Annuler</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        }
        {!loading && reservations.length === 0 && <AdminEmptyState label="Aucune réservation." />}
      </div>
    </div>
  );
}

// ─── Customers Panel ──────────────────────────────────────────────────────────
function AdminCustomers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", subscribedEmail: false });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const loadCustomers = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listAdminCustomers();
      setCustomers(data);
    } catch (e) {
      setError(e.message || "Impossible de charger les clients.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const openAdd = () => {
    setEditingCustomer(null);
    setForm({ fullName: "", phone: "", email: "", subscribedEmail: false });
    setShowForm(true);
  };

  const openEdit = (customer) => {
    setEditingCustomer(customer);
    setForm({
      fullName: customer.fullName || "",
      phone: customer.phone || "",
      email: customer.email || "",
      subscribedEmail: customer.subscribedEmail === true,
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      if (editingCustomer) {
        const updated = await updateAdminCustomer(editingCustomer.id, form);
        setCustomers((prev) => prev.map((customer) => (customer.id === updated.id ? updated : customer)));
        setSuccess('Client modifié avec succès !');
      } else {
        const created = await createAdminCustomer(form);
        setCustomers((prev) => [created, ...prev]);
        setSuccess('Client ajouté avec succès !');
      }
      setShowForm(false);
      setEditingCustomer(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setError(e.message || "Impossible d'enregistrer le client.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer) => {
    if (!confirm(`Supprimer définitivement le client "${customer.fullName}" ?`)) return;

    setError("");
    try {
      await deleteAdminCustomer(customer.id);
      setCustomers((prev) => prev.filter((row) => row.id !== customer.id));
      setSuccess("Client supprimé avec succès.");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || 'Impossible de supprimer le client.');
    }
  };

  const filtered = customers.filter((customer) =>
    customer.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    customer.phone?.includes(search) ||
    customer.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {success && <AdminNotice>{success}</AdminNotice>}
      {error && <AdminNotice type="error">{error}</AdminNotice>}
      <div className="flex gap-3 mb-6">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-white border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400 shadow-sm"
          placeholder="Rechercher par nom, téléphone ou email..."
        />
        <button onClick={openAdd} className="px-4 py-2 bg-[#b5122a] text-white rounded-lg font-medium hover:bg-[#8f0e21] transition-colors">+ Ajouter</button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-5 mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 shadow-sm">
          <h3 className="md:col-span-2 font-semibold text-gray-900">{editingCustomer ? 'Modifier le client' : 'Ajouter un client'}</h3>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Nom *</label>
            <input required value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Téléphone</label>
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm text-gray-500 mb-1">Email *</label>
            <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none" />
          </div>
          <label className="md:col-span-2 flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.subscribedEmail}
              onChange={e => setForm({ ...form, subscribedEmail: e.target.checked })}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-[#b5122a] focus:ring-[#b5122a]"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">Abonné aux emails marketing</span>
              <span className="block text-xs text-gray-500">Ce client pourra recevoir les campagnes envoyées depuis l’onglet Marketing.</span>
            </span>
          </label>
          <div className="md:col-span-2 flex gap-3 justify-end">
            <button type="submit" disabled={saving} className="px-6 py-2 bg-[#b5122a] text-white rounded-lg font-medium hover:bg-[#8f0e21] disabled:opacity-60">{saving ? '...' : editingCustomer ? 'Enregistrer' : 'Ajouter'}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingCustomer(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Annuler</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? <AdminLoadingState /> : filtered.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{c.fullName}</div>
              <div className="text-gray-500 text-sm">{c.phone || 'Téléphone non renseigné'} • {c.email}</div>
              <div className="text-xs text-gray-400 mt-1">Créé le {formatDate(c.createdAt)} • MAJ le {formatDate(c.updatedAt)}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${c.subscribedEmail ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
                {c.subscribedEmail ? "Abonné email" : "Non abonné"}
              </span>
              <span className="text-[#b5122a] font-bold text-sm">{c.orderCount || 0} commande{(c.orderCount || 0) !== 1 ? 's' : ''}</span>
              <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:text-blue-700 border border-gray-200 px-2 py-1 rounded">Éditer</button>
              <button onClick={() => handleDelete(c)} className="text-xs text-red-500 hover:text-red-600 border border-gray-200 px-2 py-1 rounded">Supprimer</button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && <AdminEmptyState label="Aucun client trouvé." />}
      </div>
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function AdminSettings() {
  const [brandingSettings, setBrandingSettings] = useState(null);
  const [brandingSuccess, setBrandingSuccess] = useState("");
  const [brandingError, setBrandingError] = useState("");
  const [brandingLoading, setBrandingLoading] = useState(false);
  const [brandingUploadFeedback, setBrandingUploadFeedback] = useState({ type: "", message: "" });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setBrandingError("");
    try {
      const brandingData = await getAdminBrandingSettings();
      setBrandingSettings(brandingData);
    } catch (e) {
      const message = e.message || "Impossible de charger les réglages.";
      setBrandingError(message);
      setBrandingSettings({ logoUrl: "", primaryColor: "#b5122a", secondaryColor: "#111827", accentColor: "#b5122a", tagline: "Restaurant" });
    }
  };

  const handleSaveBranding = async () => {
    setBrandingLoading(true);
    setBrandingError("");
    try {
      const updated = await updateAdminBrandingSettings({ logoUrl: brandingSettings.logoUrl || "" });
      setBrandingSettings(updated);
      setBrandingSuccess("Logo restaurant sauvegardé !");
      setTimeout(() => setBrandingSuccess(""), 3000);
    } catch (e) {
      setBrandingError(e.message || "Impossible de sauvegarder le logo du restaurant.");
    } finally {
      setBrandingLoading(false);
    }
  };

  const handleBrandingLogoUpload = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setBrandingLoading(true);
    setBrandingError("");
    setBrandingUploadFeedback({ type: "info", message: `Upload de ${selectedFile.name} en cours...` });

    try {
      const uploaded = await uploadAdminBrandingLogo(selectedFile);
      setBrandingSettings(uploaded.settings);
      setBrandingSuccess("Logo restaurant uploadé et sauvegardé avec succès !");
      setBrandingUploadFeedback({ type: "success", message: `Logo uploadé : ${selectedFile.name}` });
      setTimeout(() => setBrandingSuccess(""), 3000);
    } catch (e) {
      const message = e.message || "Impossible d'uploader le logo du restaurant.";
      setBrandingError(message);
      setBrandingUploadFeedback({ type: "error", message });
    } finally {
      setBrandingLoading(false);
      event.target.value = "";
    }
  };

  if (!brandingSettings) return <AdminLoadingState />;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">Appareils</h3>
          <p className="text-sm text-gray-500 mt-1">Générez un code d'association puis confirmez la demande pour rattacher un terminal Sunmi à ce restaurant.</p>
        </div>
        <AdminMenuQrCard />
        <DeviceProvisioning />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">Branding</h3>
          <p className="text-sm text-gray-500 mt-1">Le logo enregistré ici est stocké dans la configuration branding du restaurant et sera réutilisé par les e-mails et les autres surfaces dépendantes du branding.</p>
        </div>
        {brandingSuccess && <AdminNotice>{brandingSuccess}</AdminNotice>}
        {brandingError && <AdminNotice type="error">{brandingError}</AdminNotice>}
        <div>
          <label className="block text-sm text-gray-500 mb-2">Logo local</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={handleBrandingLogoUpload}
            disabled={brandingLoading}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400 file:mr-3 file:rounded file:border-0 file:bg-gray-200 file:px-2 file:py-1 file:text-gray-700"
          />
          <p className="text-xs text-gray-500 mt-2">PNG, JPG, WEBP ou GIF. Le fichier est stocké via le même pipeline S3 que les images des produits.</p>
          {brandingUploadFeedback.message && (
            <p className={`mt-2 text-sm ${brandingUploadFeedback.type === "error" ? "text-red-600" : brandingUploadFeedback.type === "success" ? "text-green-600" : "text-gray-500"}`}>
              {brandingUploadFeedback.message}
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-2">URL du logo (optionnel)</label>
          <input
            type="url"
            value={brandingSettings.logoUrl || ""}
            onChange={(e) => setBrandingSettings((current) => ({ ...current, logoUrl: e.target.value }))}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400"
            placeholder="https://.../logo.png"
          />
          <p className="text-xs text-gray-500 mt-2">Vous pouvez encore renseigner manuellement une URL si nécessaire. Laissez vide pour supprimer le logo stocké et conserver les fallbacks gracieux existants.</p>
        </div>
        {brandingSettings.logoUrl && (
          <div className="p-3 border border-gray-200 rounded-lg bg-gray-50 flex items-center gap-4">
            <img src={brandingSettings.logoUrl} alt="Logo du restaurant" className="w-20 h-20 object-contain rounded bg-white border border-gray-200 p-2" />
            <div className="text-sm text-gray-500 min-w-0">
              <p className="font-medium text-gray-700">Logo actuel</p>
              <p className="break-all">{brandingSettings.logoUrl}</p>
            </div>
          </div>
        )}
        <button
          onClick={handleSaveBranding}
          disabled={brandingLoading}
          className="w-full py-3 bg-[#b5122a] text-white font-semibold rounded-lg hover:bg-[#8f0e21] disabled:opacity-60 transition-colors"
        >
          {brandingLoading ? "Sauvegarde..." : "Sauvegarder le logo"}
        </button>
      </div>

    </div>
  );
}
