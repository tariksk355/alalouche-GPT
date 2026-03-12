import { useState, useEffect } from "react";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { formatTime, formatDate, formatDateFull } from "@/components/formatDate";
import AdminAnalytics from "@/components/admin/AdminAnalytics";
import DeviceProvisioning from "@/components/admin/DeviceProvisioning";
import { clearStoredAdminSession, getStoredAdminSession } from "@/lib/customerAuth";
import { getAdminKpis, listAdminOrders, listAdminReservations, updateAdminOrderStatus, updateAdminReservationStatus } from "@/lib/api/adminOps";
import { createAdminMenuItem, deleteAdminMenuItem, listAdminMenuCatalog, updateAdminMenuItem } from "@/lib/api/adminMenuCatalog";
import { createAdminCustomer, deleteAdminCustomer, listAdminCustomers, updateAdminCustomer } from "@/lib/api/adminCustomers";
import { getAdminPrinterSettings, updateAdminPrinterSettings } from "@/lib/api/adminSettings";

const NAV_ITEMS = [
  { id: "orders", label: "Commandes", icon: "🛒" },
  { id: "menu", label: "Menu", icon: "🍽️" },
  { id: "reservations", label: "Réservations", icon: "📅" },
  { id: "customers", label: "Clients", icon: "👥" },
  { id: "marketing", label: "Marketing", icon: "📢" },
  { id: "analytics", label: "Analytiques", icon: "📊" },
  { id: "settings", label: "Paramètres", icon: "⚙️" },
];

export default function AdminDashboard() {
  const [admin, setAdmin] = useState(null);
  const [activeTab, setActiveTab] = useState("orders");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredAdminSession();
    if (!stored) {
      window.location.href = createPageUrl("AdminLogin");
      return;
    }
    setAdmin(stored);
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
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png" alt="" className="w-14 mb-3" />
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

// ─── Orders Panel ─────────────────────────────────────────────────────────────
function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [kpis, setKpis] = useState(null);

  useEffect(() => {
    loadOrders();
    loadKpis();
  }, []);

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
    };
  };

  const loadOrders = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const data = await listAdminOrders();
      setOrders(data.map(normalizeOrder));
    } catch (error) {
      setErrorMsg(error.message || 'Impossible de charger les commandes.');
    } finally {
      setLoading(false);
    }
  };

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
    await Promise.all([loadOrders(), loadKpis()]);
  };

  const updateStatus = async (order, status) => {
    await updateAdminOrderStatus(order.id, { status });
    const labels = { ready: 'Commande marquée comme prête ✓', completed: 'Commande terminée ✓' };
    showSuccess(labels[status] || 'Statut mis à jour ✓');
    await Promise.all([loadOrders(), loadKpis()]);
  };

  const STATUS_COLORS = { new: "bg-yellow-500", accepted: "bg-blue-500", ready: "bg-green-500", completed: "bg-gray-400", cancelled: "bg-red-500" };
  const STATUS_LABELS = { new: "Nouveau", accepted: "Accepté", ready: "Prêt", completed: "Terminé", cancelled: "Annulé" };

  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  return (
    <div>
      {successMsg && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">{successMsg}</div>}
      {errorMsg && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">{errorMsg}</div>}

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

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
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

      {loading ? (
        <div className="text-center text-gray-400 py-12">Chargement...</div>
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
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[order.status]} text-white`}>{STATUS_LABELS[order.status]}</span>
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
          {filtered.length === 0 && <div className="text-center text-gray-400 py-12">Aucune commande.</div>}
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
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const CATEGORIES = ["Sandwichs et menu", "Nos sauces chaudes", "Nos sauces froides", "Plats et Pide", "Boissons", "Bières & Alcools", "Vins", "Desserts"];

  const resetForm = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", category: "Sandwichs et menu", imageUrl: "", available: true, allergens: "" });
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

  const handleEdit = (item) => {
    setEditing(item);
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
    if (!confirm("Supprimer cet article ?")) return;

    setError("");
    try {
      await deleteAdminMenuItem(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    } catch (e) {
      setError(e.message || "Impossible de supprimer l'article.");
    }
  };

  const toggleAvailable = async (item) => {
    setError("");
    try {
      const updated = await updateAdminMenuItem(item.id, { available: !(item.available !== false) });
      setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (e) {
      setError(e.message || "Impossible de modifier la disponibilité.");
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
        <h2 className="font-semibold text-lg mb-5 text-gray-900">{editing ? "Modifier l'article" : "Ajouter un article"}</h2>
        {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}
        {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
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
              <label className="block text-sm text-gray-500 mb-1">Image (URL)</label>
              <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400" placeholder="https://..." />
              {form.imageUrl && <img src={form.imageUrl} alt="" className="mt-2 w-20 h-20 object-cover rounded" />}
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
            <button type="submit" disabled={saving}
              className="flex-1 py-2 bg-[#b5122a] text-white rounded-lg font-medium hover:bg-[#8f0e21] disabled:opacity-60 transition-colors">
              {saving ? "..." : editing ? "Modifier" : "Ajouter"}
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
          {loading ? <div className="text-center text-gray-400 py-12">Chargement...</div> : items.map(item => (
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

  const normalizeReservation = (reservation) => ({
    ...reservation,
    name: reservation.customerName,
    email: reservation.customerEmail,
    guests: reservation.guestCount,
    date: formatDate(reservation.reservationDate),
    time: formatTime(reservation.reservationDate),
    created_date: reservation.createdAt,
  });

  const loadReservations = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const data = await listAdminReservations();
      setReservations(data.map(normalizeReservation));
    } catch (error) {
      setErrorMsg(error.message || 'Impossible de charger les réservations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReservations();
  }, []);

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

  const STATUS_COLORS = { pending: 'bg-yellow-500', confirmed: 'bg-green-500', cancelled: 'bg-red-500' };
  const STATUS_LABELS = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' };

  return (
    <div>
      {successMsg && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm font-medium">{successMsg}</div>}
      {errorMsg && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">{errorMsg}</div>}
      <div className="space-y-3">
        {loading ? <div className="text-center text-gray-400 py-12">Chargement...</div> :
          reservations.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <div className="font-semibold text-lg text-gray-900">{r.name}</div>
                  <div className="text-gray-500 text-sm">{r.date} à {r.time} — {r.guests} personne{r.guests > 1 ? 's' : ''}</div>
                  <div className="text-gray-400 text-sm mt-1">{r.email || 'email non renseigné'}</div>
                  {r.created_date && <div className="text-gray-400 text-xs mt-1">Reçu le {formatDateFull(r.created_date)} à {formatTime(r.created_date)}</div>}
                  {r.notes && <div className="text-gray-500 text-sm mt-1 italic">"{r.notes}"</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs font-medium text-white ${STATUS_COLORS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
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
        {!loading && reservations.length === 0 && <div className="text-center text-gray-400 py-12">Aucune réservation.</div>}
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
  const [form, setForm] = useState({ fullName: "", phone: "", email: "" });
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
    setForm({ fullName: "", phone: "", email: "" });
    setShowForm(true);
  };

  const openEdit = (customer) => {
    setEditingCustomer(customer);
    setForm({
      fullName: customer.fullName || "",
      phone: customer.phone || "",
      email: customer.email || "",
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
    if (!confirm(`Supprimer "${customer.fullName}" ?`)) return;

    setError("");
    try {
      await deleteAdminCustomer(customer.id);
      setCustomers((prev) => prev.filter((row) => row.id !== customer.id));
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
      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
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
          <div className="md:col-span-2 flex gap-3 justify-end">
            <button type="submit" disabled={saving} className="px-6 py-2 bg-[#b5122a] text-white rounded-lg font-medium hover:bg-[#8f0e21] disabled:opacity-60">{saving ? '...' : editingCustomer ? 'Enregistrer' : 'Ajouter'}</button>
            <button type="button" onClick={() => { setShowForm(false); setEditingCustomer(null); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">Annuler</button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? <div className="text-center text-gray-400 py-12">Chargement...</div> : filtered.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between shadow-sm">
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{c.fullName}</div>
              <div className="text-gray-500 text-sm">{c.phone || 'Téléphone non renseigné'} • {c.email}</div>
              <div className="text-xs text-gray-400 mt-1">Créé le {formatDate(c.createdAt)} • MAJ le {formatDate(c.updatedAt)}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[#b5122a] font-bold text-sm">{c.orderCount || 0} commande{(c.orderCount || 0) !== 1 ? 's' : ''}</span>
              <button onClick={() => openEdit(c)} className="text-xs text-blue-600 hover:text-blue-700 border border-gray-200 px-2 py-1 rounded">Éditer</button>
              <button onClick={() => handleDelete(c)} className="text-xs text-red-500 hover:text-red-600 border border-gray-200 px-2 py-1 rounded">Supprimer</button>
            </div>
          </div>
        ))}
        {!loading && filtered.length === 0 && <div className="text-center text-gray-400 py-12">Aucun client trouvé.</div>}
      </div>
    </div>
  );
}

function AdminMarketing() {
  const [emailForm, setEmailForm] = useState({ subject: "", body: "" });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [customerCount, setCustomerCount] = useState(0);

  useEffect(() => {
    base44.entities.Customer.filter({ subscribed_email: true }).then(data => setCustomerCount(data.length));
  }, []);

  const sendBulkEmail = async (e) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setSuccess("");
    const customers = await base44.entities.Customer.filter({ subscribed_email: true });
    const recipientEmails = customers.filter(c => c.email).map(c => c.email);
    if (recipientEmails.length === 0) { setSuccess("Aucun client avec une adresse email abonné."); setLoading(false); return; }
    const res = await base44.functions.invoke("sendBulkMarketingEmail", { emails: recipientEmails, subject: emailForm.subject, body: emailForm.body });
    if (res.data?.success) {
      setSuccess(`✅ Email envoyé à ${res.data.sentCount} client(s) !`);
      setEmailForm({ subject: "", body: "" });
    } else {
      setSuccess(`❌ Erreur : ${res.data?.error || "Échec"}`);
    }
    setLoading(false);
    setTimeout(() => setSuccess(""), 6000);
  };

  return (
    <div className="max-w-2xl">
      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}
      <form onSubmit={sendBulkEmail} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 shadow-sm">
        <p className="text-gray-500 text-sm">{customerCount} clients abonnés aux emails</p>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Sujet *</label>
          <input required value={emailForm.subject} onChange={e => setEmailForm({ ...emailForm, subject: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400" placeholder="Promotion du week-end !" />
        </div>
        <div>
          <label className="block text-sm text-gray-500 mb-1">Message *</label>
          <textarea required rows={8} value={emailForm.body} onChange={e => setEmailForm({ ...emailForm, body: e.target.value })}
            className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-4 py-2 rounded-lg focus:outline-none focus:border-gray-400 resize-none" placeholder="Votre message..." />
        </div>
        <button type="submit" disabled={loading} className="w-full py-3 bg-[#b5122a] text-white font-semibold rounded-lg hover:bg-[#8f0e21] disabled:opacity-60 transition-colors">
          {loading ? "Envoi en cours..." : "Envoyer à tous les abonnés"}
        </button>
      </form>
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function AdminSettings() {
  const [settings, setSettings] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setError("");
    try {
      const data = await getAdminPrinterSettings();
      setSettings(data);
    } catch (e) {
      setError(e.message || "Impossible de charger les paramètres.");
      setSettings({ auto_print: true, paper_width: "58mm", copies: 1, default_prep_time: 30, require_prep_time: true });
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError("");
    try {
      const updated = await updateAdminPrinterSettings(settings);
      setSettings(updated);
      setSuccess("Paramètres sauvegardés !");
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Impossible de sauvegarder les paramètres.");
    } finally {
      setLoading(false);
    }
  };

  if (!settings) return <div className="text-gray-400">Chargement...</div>;

  return (
    <div className="max-w-lg">
      {success && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}
      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6 shadow-sm">
        <DeviceProvisioning />
        <div>
          <h3 className="font-semibold text-lg mb-4 text-gray-900">Imprimante</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-gray-700">Impression automatique</label>
              <button onClick={() => setSettings(s => ({ ...s, auto_print: !s.auto_print }))}
                className={`w-12 h-6 rounded-full transition-colors ${settings.auto_print ? "bg-[#b5122a]" : "bg-gray-300"} relative`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.auto_print ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-2">Largeur du papier</label>
              <div className="flex gap-3">
                {["58mm", "80mm"].map(w => (
                  <button key={w} onClick={() => setSettings(s => ({ ...s, paper_width: w }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${settings.paper_width === w ? "border-[#b5122a] text-[#b5122a] bg-red-50" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                    {w}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-2">Nombre de copies</label>
              <div className="flex gap-3">
                {[1, 2, 3].map(n => (
                  <button key={n} onClick={() => setSettings(s => ({ ...s, copies: n }))}
                    className={`w-10 h-10 rounded-lg border transition-colors ${settings.copies === n ? "border-[#b5122a] text-[#b5122a] bg-red-50" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-lg mb-4 text-gray-900">Commandes</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-2">Temps de préparation par défaut</label>
              <div className="flex gap-3 flex-wrap">
                {[15, 30, 45, 60].map(t => (
                  <button key={t} onClick={() => setSettings(s => ({ ...s, default_prep_time: t }))}
                    className={`px-4 py-2 rounded-lg border transition-colors ${settings.default_prep_time === t ? "border-[#b5122a] text-[#b5122a] bg-red-50" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                    {t} min
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-gray-700">Sélection de délai obligatoire</label>
              <button onClick={() => setSettings(s => ({ ...s, require_prep_time: !s.require_prep_time }))}
                className={`w-12 h-6 rounded-full transition-colors ${settings.require_prep_time ? "bg-[#b5122a]" : "bg-gray-300"} relative`}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.require_prep_time ? "translate-x-7" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>
        <button onClick={handleSave} disabled={loading}
          className="w-full py-3 bg-[#b5122a] text-white font-semibold rounded-lg hover:bg-[#8f0e21] disabled:opacity-60 transition-colors">
          {loading ? "Sauvegarde..." : "Sauvegarder les paramètres"}
        </button>
      </div>
    </div>
  );
}
