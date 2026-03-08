import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

const STATUS_LABELS = { new: "Nouveau", accepted: "En préparation", ready: "Prêt", completed: "Terminé", cancelled: "Annulé" };
const STATUS_COLORS = {
  new: "bg-yellow-100 text-yellow-800",
  accepted: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700"
};

export default function MesCommandes() {
  const [phone, setPhone] = useState("");
  const [orders, setOrders] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Normalize phone: strip spaces, dashes, dots
  const normalizePhone = (p) => p.replace(/[\s\-\.]/g, "");

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);

    const raw = normalizePhone(phone);

    // Build variants to search: raw input + with/without country code
    const variants = new Set([raw]);
    if (raw.startsWith("+")) {
      // e.g. +41791234567 → also try 0791234567
      variants.add("0" + raw.slice(3));
    } else if (raw.startsWith("00")) {
      // e.g. 0041791234567 → also try 0791234567
      variants.add("0" + raw.slice(4));
    } else if (raw.startsWith("0")) {
      // e.g. 0791234567 → also try +41791234567
      variants.add("+41" + raw.slice(1));
    }

    // Fetch all orders and filter client-side across all variants
    const allOrders = await base44.entities.Order.list("-created_date", 200);
    const results = allOrders.filter(o => {
      const p = normalizePhone(o.customer_phone || "");
      return [...variants].some(v => p === v);
    });

    setOrders(results);
    setSearched(true);
    setLoading(false);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="bg-black text-white py-16 text-center">
        <h1 className="text-4xl font-serif italic mb-2">Mes commandes</h1>
        <p className="text-gray-400">Retrouvez l'historique de vos commandes</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-12">
        <form onSubmit={handleSearch} className="mb-10">
          <label className="block text-sm font-medium text-gray-700 mb-2">Votre numéro de téléphone</label>
          <div className="flex gap-3">
            <input
              required
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="ex: 0791234567 ou +41791234567"
              className="flex-1 border border-gray-300 px-4 py-3 focus:outline-none focus:border-black transition-colors"
            />
            <button type="submit" disabled={loading}
              className="px-6 py-3 bg-[#b5122a] text-white font-medium hover:bg-[#8f0e21] transition-colors disabled:opacity-60 whitespace-nowrap">
              {loading ? "..." : "Rechercher"}
            </button>
          </div>
        </form>

        {searched && orders !== null && (
          orders.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-lg mb-2">Aucune commande trouvée</p>
              <p className="text-sm">Vérifiez votre numéro de téléphone ou <Link to={createPageUrl("Order")} className="text-[#b5122a] underline">passez une commande</Link>.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">{orders.length} commande{orders.length > 1 ? "s" : ""} trouvée{orders.length > 1 ? "s" : ""}</p>
              {orders.map(order => (
                <div key={order.id} className="border border-gray-200 rounded-lg p-5">
                  <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
                    <div>
                      <div className="font-semibold text-gray-900">#{order.order_number}</div>
                      <div className="text-gray-500 text-sm mt-0.5">{formatDate(order.created_date)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      <span className="text-xs text-gray-500 border border-gray-200 px-2 py-1 rounded-full">
                        {order.order_type === "takeaway" ? "À emporter" : "Livraison"}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {order.items?.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-gray-700">{item.name} <span className="text-gray-400">×{item.quantity}</span></span>
                        <span className="text-gray-600">CHF {(item.price * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {order.prep_time_minutes && (order.status === "accepted" || order.status === "new") && (
                    <div className="mb-3 bg-blue-50 rounded-md px-4 py-3">
                      <p className="text-blue-800 text-sm font-medium">
                        ⏱ Temps de préparation estimé : <strong>{order.prep_time_minutes} minutes</strong>
                      </p>
                      {order.ready_at && (
                        <p className="text-blue-600 text-sm mt-1">
                          Prête vers : <strong>{new Date(order.ready_at).toLocaleTimeString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit" })}</strong>
                        </p>
                      )}
                    </div>
                  )}
                  {order.status === "ready" && (
                    <div className="mb-3 bg-green-50 rounded-md px-4 py-3">
                      <p className="text-green-700 text-sm font-medium">🎉 Votre commande est prête !</p>
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-3 flex justify-between items-center">
                    <span className="text-sm text-gray-500">{order.payment_method === "cash" ? "Espèces" : "Carte"}</span>
                    <span className="font-bold text-gray-900">CHF {order.total_amount?.toFixed(2)}</span>
                  </div>

                  {order.notes && (
                    <div className="mt-2 text-xs text-gray-400 italic">Note : {order.notes}</div>
                  )}
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}