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
import { createAdminMenuItem, deleteAdminMenuItem, listAdminMenuCatalog, updateAdminMenuItem, uploadAdminMenuImage } from "@/lib/api/adminMenuCatalog";
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
                        <div key={i} className="flex justify-between text-gray-600 py-1">
                          <span>{item.name} x{item.quantity}</span>
                          <span>CHF {(item.price * item.quantity).toFixed(2)}</span>
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
  const [form, setForm] = useState({ name: "", description: "", price: "", category: "Sandwichs et menu", imageUrl: "", available: true, allergens: "" });
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState({ type: "", message: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const CATEGORIES = ["Sandwichs et menu", "Nos sauces chaudes", "Nos sauces froides", "Plats et Pide", "Boissons", "Bières & Alcools", "Vins", "Desserts"];

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", category: "Sandwichs et menu", imageUrl: "", available: true, allergens: "" });
    setUploadFeedback({ type: "", message: "" });
  };

  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listAdminMenuCatalog();
      setItems(data);
    } catch (e) {
      setError(e.message || "Impossible de charger le catalogue menu.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    const payload = {
      name: form.name,
      description: form.description,
      price: parseFloat(form.price),
      category: form.category,
      imageUrl: form.imageUrl,
      available: form.available,
      allergens: form.allergens,
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
    setForm({
      name: item.name,
      description: item.description || "",
      price: String(item.price),
      category: item.category,
      imageUrl: item.imageUrl || "",
      available: item.available !== false,
      allergens: item.allergens || "",
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
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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
  const [announcementSettings, setAnnouncementSettings] = useState(null);
  const [announcementSuccess, setAnnouncementSuccess] = useState("");
  const [announcementError, setAnnouncementError] = useState("");
  const [announcementLoading, setAnnouncementLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setBrandingError("");
    setAnnouncementError("");
    try {
      const [brandingData, announcementData] = await Promise.all([
        getAdminBrandingSettings(),
        getAdminStorefrontAnnouncementSettings(),
      ]);
      setBrandingSettings(brandingData);
      setAnnouncementSettings(announcementData);
    } catch (e) {
      const message = e.message || "Impossible de charger les réglages.";
      setBrandingError(message);
      setBrandingSettings({ logoUrl: "", primaryColor: "#b5122a", secondaryColor: "#111827", accentColor: "#b5122a", tagline: "Restaurant" });
      setAnnouncementSettings({ active: false, message: "" });
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

  if (!brandingSettings || !announcementSettings) return <AdminLoadingState />;

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

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">Annonce storefront</h3>
          <p className="text-sm text-gray-500 mt-1">Publiez un court message opérationnel visible en haut du storefront public. Lorsque l’annonce est inactive ou vide, rien n’est affiché côté client.</p>
        </div>
        {announcementSuccess && <AdminNotice>{announcementSuccess}</AdminNotice>}
        {announcementError && <AdminNotice type="error">{announcementError}</AdminNotice>}
        <label className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <div>
            <div className="font-medium text-gray-900">Annonce active</div>
            <div className="text-sm text-gray-500">Activez ou désactivez rapidement le bandeau public.</div>
          </div>
          <input
            type="checkbox"
            checked={announcementSettings.active === true}
            onChange={(e) => setAnnouncementSettings((current) => ({ ...current, active: e.target.checked }))}
            className="h-5 w-5 rounded border-gray-300 text-[#b5122a] focus:ring-[#b5122a]"
          />
        </label>
        <div>
          <label className="block text-sm text-gray-500 mb-2">Message</label>
          <textarea
            rows={4}
            maxLength={280}
            value={announcementSettings.message || ""}
            onChange={(e) => setAnnouncementSettings((current) => ({ ...current, message: e.target.value }))}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-3 rounded-lg focus:outline-none focus:border-gray-400 resize-none"
            placeholder="Exemple : Fermé exceptionnellement le lundi 1er janvier. Merci de votre compréhension."
          />
          <p className="text-xs text-gray-500 mt-2">{(announcementSettings.message || "").length}/280 caractères</p>
        </div>
        <button
          onClick={handleSaveAnnouncement}
          disabled={announcementLoading}
          className="w-full py-3 bg-[#b5122a] text-white font-semibold rounded-lg hover:bg-[#8f0e21] disabled:opacity-60 transition-colors"
        >
          {announcementLoading ? "Sauvegarde..." : "Sauvegarder l’annonce"}
        </button>
      </div>

    </div>
  );
}
