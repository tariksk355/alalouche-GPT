import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

// SUNMI Receiver Screen — for handheld Android device
export default function OrderReceiver() {
  const [orders, setOrders] = useState([]);
  const [settings, setSettings] = useState({ auto_print: true, paper_width: "58mm", copies: 1, default_prep_time: 30, require_prep_time: true });
  const [auth, setAuth] = useState(null);
  const [newOrderAlert, setNewOrderAlert] = useState(null);
  const audioRef = useRef(null);
  const printedIds = useRef(new Set());

  useEffect(() => {
    const stored = localStorage.getItem("alalouche_admin");
    if (!stored) {
      window.location.href = createPageUrl("AdminLogin");
      return;
    }
    setAuth(JSON.parse(stored));
    loadData();
  }, []);

  const loadData = async () => {
    const [orderData, settingsData] = await Promise.all([
      base44.entities.Order.filter({ status: "new" }, "-created_date", 50),
      base44.entities.PrinterSettings.list()
    ]);
    const allRecent = await base44.entities.Order.list("-created_date", 30);
    setOrders(allRecent);
    if (settingsData.length > 0) setSettings(settingsData[0]);
  };

  useEffect(() => {
    const unsub = base44.entities.Order.subscribe(async (event) => {
      if (event.type === "create") {
        setOrders(prev => [event.data, ...prev]);
        setNewOrderAlert(event.data);
        setTimeout(() => setNewOrderAlert(null), 5000);
        // Auto print
        if (settings.auto_print && !printedIds.current.has(event.data.id)) {
          printedIds.current.add(event.data.id);
          await printOrder(event.data);
          await base44.entities.Order.update(event.data.id, { printed: true, printed_at: new Date().toISOString() });
        }
      } else if (event.type === "update") {
        setOrders(prev => prev.map(o => o.id === event.id ? event.data : o));
      }
    });
    return unsub;
  }, [settings.auto_print]);

  const setPrepTime = async (order, minutes) => {
    const readyAt = new Date(Date.now() + minutes * 60000).toISOString();
    await base44.entities.Order.update(order.id, { prep_time_minutes: minutes, ready_at: readyAt, status: "accepted" });
    if (!order.printed && !printedIds.current.has(order.id)) {
      printedIds.current.add(order.id);
      await printOrder({ ...order, prep_time_minutes: minutes, ready_at: readyAt });
      await base44.entities.Order.update(order.id, { printed: true, printed_at: new Date().toISOString() });
    }
  };

  const printOrder = async (order) => {
    const readyTime = order.ready_at
      ? new Date(order.ready_at).toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" })
      : "—";
    const itemsText = (order.items || []).map(i => `${i.name} x${i.quantity}  CHF ${(i.price * i.quantity).toFixed(2)}`).join("\n");

    // Müşterinin toplam kaç siparişi olduğunu bul
    const customerOrders = await base44.entities.Order.filter({ customer_phone: order.customer_phone });
    const totalCustomerOrders = customerOrders.length;

    const receiptContent = `
================================
      À LA LOUCHE
  Rte de Chantemerle 58
  1763 Granges-Paccot
  026 303 45 61
================================
N°: ${order.order_number}
Date: ${new Date(order.created_date).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}
Type: ${order.order_type === "takeaway" ? "À EMPORTER" : "LIVRAISON"}
Paiement: ${order.payment_method === "cash" ? "ESPÈCES" : "CARTE"}
================================
CLIENT: ${order.customer_name}
TEL: ${order.customer_phone}
${order.customer_address ? "ADRESSE: " + order.customer_address : ""}
================================
ARTICLES:
${itemsText}
--------------------------------
TOTAL: CHF ${order.total_amount?.toFixed(2)}
TOTAL ORDERS: ${totalCustomerOrders}
================================
${order.prep_time_minutes ? `PRÉPARATION: ${order.prep_time_minutes} min\nPRÊT À: ${readyTime}` : ""}
${order.notes ? "NOTES: " + order.notes : ""}
================================
    `;

    // For SUNMI: use window.print() with print-only CSS
    const printWindow = window.open("", "_blank", "width=400,height=600");
    printWindow.document.write(`
      <html><head>
        <style>
          body { font-family: monospace; font-size: 12px; width: ${settings.paper_width === "58mm" ? "58mm" : "80mm"}; margin: 0; padding: 4px; }
          pre { white-space: pre-wrap; word-wrap: break-word; margin: 0; }
        </style>
      </head><body><pre>${receiptContent}</pre></body></html>
    `);
    printWindow.document.close();
    printWindow.print();
    setTimeout(() => printWindow.close(), 1000);
  };

  const STATUS_COLORS = { new: "border-yellow-500", accepted: "border-blue-500", ready: "border-green-500", completed: "border-gray-600", cancelled: "border-red-800" };
  const STATUS_BG = { new: "bg-yellow-500/10", accepted: "bg-blue-500/10", ready: "bg-green-500/10", completed: "bg-gray-900", cancelled: "bg-red-900/10" };
  const STATUS_LABELS = { new: "NOUVEAU", accepted: "Accepté", ready: "Prêt", completed: "Terminé", cancelled: "Annulé" };

  const pendingCount = orders.filter(o => o.status === "new").length;

  if (!auth) return null;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* New order alert */}
      {newOrderAlert && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500 text-black px-6 py-4 flex items-center justify-between animate-pulse">
          <div>
            <span className="font-bold text-lg">🔔 NOUVELLE COMMANDE!</span>
            <span className="ml-3">{newOrderAlert.order_number} — {newOrderAlert.customer_name}</span>
          </div>
          <span className="font-bold">CHF {newOrderAlert.total_amount?.toFixed(2)}</span>
        </div>
      )}

      <header className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="font-semibold">Réception des commandes</span>
          {pendingCount > 0 && (
            <span className="bg-yellow-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{pendingCount} nouveau{pendingCount > 1 ? "x" : ""}</span>
          )}
        </div>
        <button onClick={() => window.location.href = createPageUrl("AdminDashboard")} className="text-gray-400 hover:text-white text-sm">
          Admin →
        </button>
      </header>

      <div className="p-4 space-y-4">
        {orders.filter(o => o.status !== "completed" && o.status !== "cancelled").map(order => (
          <div key={order.id} className={`rounded-xl border-2 ${STATUS_COLORS[order.status]} ${STATUS_BG[order.status]} p-4`}>
            <div className="flex items-start justify-between mb-3 gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-lg">{order.order_number}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${order.status === "new" ? "bg-yellow-500 text-black" : "bg-gray-700 text-white"}`}>
                    {STATUS_LABELS[order.status]}
                  </span>
                </div>
                <div className="text-white font-medium">{order.customer_name}</div>
                <div className="text-gray-400 text-sm">{order.customer_phone}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-bold text-lg">CHF {order.total_amount?.toFixed(2)}</div>
                <div className="text-gray-400 text-xs">{order.order_type === "takeaway" ? "Emporter" : "Livraison"}</div>
                <div className="text-gray-400 text-xs">{order.payment_method === "cash" ? "Espèces" : "Carte"}</div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-black/30 rounded-lg p-3 mb-3">
              {order.items?.map((item, i) => (
                <div key={i} className="flex justify-between text-sm mb-1">
                  <span>{item.name} <span className="text-gray-400">×{item.quantity}</span></span>
                  <span>CHF {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
              {order.notes && <p className="text-yellow-400 text-xs mt-2 italic">📝 {order.notes}</p>}
              {order.customer_address && <p className="text-blue-400 text-xs mt-1">📍 {order.customer_address}</p>}
            </div>

            {/* Prep time selection */}
            {order.status === "new" && (
              <div className="bg-yellow-500/20 border border-yellow-500/40 rounded-lg p-3 mb-3">
                <p className="text-yellow-300 text-sm font-bold mb-2">⚠️ Choisir le temps de préparation :</p>
                <div className="flex gap-2">
                  {[15, 30, 45, 60].map(mins => (
                    <button key={mins} onClick={() => setPrepTime(order, mins)}
                      className="flex-1 py-3 bg-yellow-500 text-black font-bold rounded-lg hover:bg-yellow-400 active:scale-95 transition-all text-lg">
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Ready time display */}
            {order.status === "accepted" && order.ready_at && (
              <div className="bg-blue-500/20 border border-blue-500/40 rounded-lg p-3 mb-3 text-center">
                <span className="text-blue-300 font-bold">⏱ Prêt à: {new Date(order.ready_at).toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="text-blue-400 text-sm ml-2">({order.prep_time_minutes} min)</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {order.status === "accepted" && (
                <button onClick={() => base44.entities.Order.update(order.id, { status: "ready" })}
                  className="flex-1 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 active:scale-95 transition-all">
                  ✓ Prêt
                </button>
              )}
              {order.status === "ready" && (
                <button onClick={() => base44.entities.Order.update(order.id, { status: "completed" })}
                  className="flex-1 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-500 active:scale-95 transition-all">
                  ✓ Terminé
                </button>
              )}
              <button onClick={() => printOrder(order)}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-600 active:scale-95 transition-all">
                🖨️ {order.printed ? "Re-imprimer" : "Imprimer"}
              </button>
            </div>
          </div>
        ))}

        {orders.filter(o => o.status !== "completed" && o.status !== "cancelled").length === 0 && (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">✓</div>
            <p className="text-gray-500 text-lg">Aucune commande en attente</p>
            <p className="text-gray-600 text-sm">Les nouvelles commandes apparaîtront ici</p>
          </div>
        )}
      </div>
    </div>
  );
}