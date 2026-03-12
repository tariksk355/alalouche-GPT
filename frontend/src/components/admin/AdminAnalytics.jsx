import { useEffect, useState } from 'react';
import { getAdminAnalyticsOverview } from '@/lib/api/adminAnalytics';

function StatCard({ label, value, sub, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-gray-500 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-gray-400 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function formatFrDay(dateStr) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'numeric' });
}

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState({
    today: { visits: null, orders: 0, revenue: 0 },
    totals: { visits: null, orders: 0, revenue: 0 },
    orderTypeStats: { takeaway: 0, delivery: 0, other: 0 },
    last7: [],
    notes: { visits: '' },
  });

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      const overview = await getAdminAnalyticsOverview();
      setData(overview);
    } catch (e) {
      setError(e.message || 'Impossible de charger les analytiques.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="text-center text-gray-400 py-12">Chargement...</div>;
  if (error) return <div className="text-center text-red-500 py-12">{error}</div>;

  const maxVisits = Math.max(...data.last7.map((d) => d.visits || 0), 1);
  const maxOrders = Math.max(...data.last7.map((d) => d.orders || 0), 1);
  const maxRevenue = Math.max(...data.last7.map((d) => d.revenue || 0), 1);

  const totalOrderTypes = data.orderTypeStats.takeaway + data.orderTypeStats.delivery + data.orderTypeStats.other || 1;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Aujourd&apos;hui</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Visiteurs aujourd&apos;hui" value={data.today.visits ?? '—'} color="text-blue-600" />
          <StatCard label="Commandes aujourd&apos;hui" value={data.today.orders} color="text-[#b5122a]" />
          <StatCard label="Chiffre d&apos;affaires du jour" value={`CHF ${Number(data.today.revenue || 0).toFixed(2)}`} color="text-green-600" />
          <StatCard label="Visiteurs totaux" value={data.totals.visits ?? '—'} sub="depuis le début" />
        </div>
        {data.notes?.visits && <p className="text-xs text-gray-400 mt-2">{data.notes.visits}</p>}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Total</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Commandes totales" value={data.totals.orders} />
          <StatCard label="Chiffre d&apos;affaires total" value={`CHF ${Number(data.totals.revenue || 0).toFixed(2)}`} color="text-green-700" />
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
              <div>
                <span className="text-2xl font-bold text-gray-900">{data.orderTypeStats.other}</span>
                <p className="text-gray-400 text-xs">Autres</p>
              </div>
            </div>
            <div className="mt-3 flex h-2 rounded-full overflow-hidden bg-gray-100">
              <div className="bg-[#b5122a] transition-all" style={{ width: `${(data.orderTypeStats.takeaway / totalOrderTypes) * 100}%` }} />
              <div className="bg-blue-400 transition-all" style={{ width: `${(data.orderTypeStats.delivery / totalOrderTypes) * 100}%` }} />
              <div className="bg-gray-400 transition-all" style={{ width: `${(data.orderTypeStats.other / totalOrderTypes) * 100}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-700 mb-6">7 derniers jours</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-center">
            <thead>
              <tr className="text-gray-400 text-xs">
                <th className="pb-2 text-left">Jour</th>
                <th className="pb-2">Visites</th>
                <th className="pb-2">Commandes</th>
                <th className="pb-2">CA (CHF)</th>
              </tr>
            </thead>
            <tbody>
              {data.last7.map((d) => (
                <tr key={d.date} className="border-t border-gray-100">
                  <td className="py-2 text-left font-medium text-gray-700">{formatFrDay(d.date)}</td>
                  <td className="py-2 text-gray-500">{d.visits ?? '—'}</td>
                  <td className="py-2 text-gray-900 font-semibold">{d.orders}</td>
                  <td className="py-2 text-green-700 font-semibold">{Number(d.revenue || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-xs text-gray-400 mb-2">Visites (7j)</p>
            <div className="flex items-end gap-1 h-20">
              {data.last7.map((d) => (
                <div key={`${d.date}-v`} className="flex-1 bg-blue-100 rounded-t" style={{ height: `${((d.visits || 0) / maxVisits) * 100}%` }} title={`${d.visits ?? '—'} visites`} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">Commandes (7j)</p>
            <div className="flex items-end gap-1 h-20">
              {data.last7.map((d) => (
                <div key={`${d.date}-o`} className="flex-1 bg-[#f4c8d0] rounded-t" style={{ height: `${(d.orders / maxOrders) * 100}%` }} title={`${d.orders} commandes`} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">CA (7j)</p>
            <div className="flex items-end gap-1 h-20">
              {data.last7.map((d) => (
                <div key={`${d.date}-r`} className="flex-1 bg-green-100 rounded-t" style={{ height: `${((d.revenue || 0) / maxRevenue) * 100}%` }} title={`${Number(d.revenue || 0).toFixed(2)} CHF`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
