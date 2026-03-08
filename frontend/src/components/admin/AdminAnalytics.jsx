import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

function StatCard({ label, value, sub, color = "text-gray-900" }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-gray-500 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    totalVisits: 0,
    todayVisits: 0,
    totalOrders: 0,
    todayOrders: 0,
    todayRevenue: 0,
    totalRevenue: 0,
    orderTypeStats: { takeaway: 0, delivery: 0 },
    dailyVisits: [],
    dailyOrders: [],
  });

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    const today = new Date().toISOString().split("T")[0];

    const [visits, orders] = await Promise.all([
      base44.entities.Visit.list("-created_date", 1000),
      base44.entities.Order.list("-created_date", 1000),
    ]);

    const todayVisits = visits.filter(v => v.date === today).length;
    const todayOrders = orders.filter(o => o.created_date?.startsWith(today));
    const todayRevenue = todayOrders.reduce((s, o) => s + (o.total_amount || 0), 0);
    const totalRevenue = orders.reduce((s, o) => s + (o.total_amount || 0), 0);

    const orderTypeStats = {
      takeaway: orders.filter(o => o.order_type === "takeaway").length,
      delivery: orders.filter(o => o.order_type === "delivery").length,
    };

    // Last 7 days
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const label = d.toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "numeric" });
      last7.push({
        date: dateStr,
        label,
        visits: visits.filter(v => v.date === dateStr).length,
        orders: orders.filter(o => o.created_date?.startsWith(dateStr)).length,
        revenue: orders.filter(o => o.created_date?.startsWith(dateStr)).reduce((s, o) => s + (o.total_amount || 0), 0),
      });
    }

    setData({
      totalVisits: visits.length,
      todayVisits,
      totalOrders: orders.length,
      todayOrders: todayOrders.length,
      todayRevenue,
      totalRevenue,
      orderTypeStats,
      last7,
    });
    setLoading(false);
  };

  if (loading) return <div className="text-center text-gray-400 py-12">Chargement...</div>;

  const maxVisits = Math.max(...data.last7.map(d => d.visits), 1);
  const maxOrders = Math.max(...data.last7.map(d => d.orders), 1);
  const maxRevenue = Math.max(...data.last7.map(d => d.revenue), 1);

  const totalOrderTypes = data.orderTypeStats.takeaway + data.orderTypeStats.delivery || 1;

  return (
    <div className="space-y-8">
      {/* KPIs */}
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Aujourd'hui</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Visiteurs aujourd'hui" value={data.todayVisits} color="text-blue-600" />
          <StatCard label="Commandes aujourd'hui" value={data.todayOrders} color="text-[#b5122a]" />
          <StatCard label="Chiffre d'affaires du jour" value={`CHF ${data.todayRevenue.toFixed(2)}`} color="text-green-600" />
          <StatCard label="Visiteurs totaux" value={data.totalVisits} sub="depuis le début" />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Total</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Commandes totales" value={data.totalOrders} />
          <StatCard label="Chiffre d'affaires total" value={`CHF ${data.totalRevenue.toFixed(2)}`} color="text-green-700" />
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <p className="text-gray-500 text-sm mb-3">Type de commande</p>
            <div className="flex gap-4 text-sm">
              <div>
                <span className="text-2xl font-bold text-gray-900">{data.orderTypeStats.takeaway}</span>
                <p className="text-gray-400 text-xs">À emporter</p>
              </div>
              <div>
                <span className="text-2xl font-bold text-gray-900">{data.orderTypeStats.delivery}</span>
                <p className="text-gray-400 text-xs">Livraison</p>
              </div>
            </div>
            {/* Simple bar */}
            <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-gray-100">
              <div
                className="bg-[#b5122a] transition-all"
                style={{ width: `${(data.orderTypeStats.takeaway / totalOrderTypes) * 100}%` }}
              />
              <div
                className="bg-blue-400 transition-all"
                style={{ width: `${(data.orderTypeStats.delivery / totalOrderTypes) * 100}%` }}
              />
            </div>
            <div className="flex gap-4 mt-1 text-xs text-gray-400">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#b5122a] inline-block" /> À emporter</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Livraison</span>
            </div>
          </div>
        </div>
      </div>

      {/* Last 7 days chart */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-700 mb-6">7 derniers jours</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="text-gray-400 text-xs">
                <th className="text-left pb-3 font-normal">Jour</th>
                <th className="pb-3 font-normal">Visiteurs</th>
                <th className="pb-3 font-normal">Commandes</th>
                <th className="pb-3 font-normal">Chiffre d'affaires</th>
              </tr>
            </thead>
            <tbody>
              {data.last7.map((day, i) => (
                <tr key={i} className={`border-t border-gray-50 ${day.date === new Date().toISOString().split("T")[0] ? "bg-red-50" : ""}`}>
                  <td className="py-3 text-left text-gray-700 font-medium">{day.label}</td>
                  <td className="py-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-2">
                        <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${(day.visits / maxVisits) * 100}%` }} />
                      </div>
                      <span className="text-gray-700 w-6 text-right">{day.visits}</span>
                    </div>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-2">
                        <div className="bg-[#b5122a] h-2 rounded-full" style={{ width: `${(day.orders / maxOrders) * 100}%` }} />
                      </div>
                      <span className="text-gray-700 w-6 text-right">{day.orders}</span>
                    </div>
                  </td>
                  <td className="py-3 text-green-700 font-medium">CHF {day.revenue.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}