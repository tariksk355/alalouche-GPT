import { useEffect, useState } from "react";
import { backendClient } from "@/api/backendClient";

export default function OrderReceiver() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  const token = localStorage.getItem("device_access_token");

  async function loadOrders() {
    if (!token) {
      setError("Appareil non authentifié. Associez l'appareil d'abord.");
      return;
    }

    try {
      const res = await backendClient.request("/receiver/orders", {
        headers: { Authorization: `Bearer ${token}` },
      });
      setOrders(res.data.orders || []);
    } catch (e) {
      setError(e.message);
    }
  }

  async function setStatus(orderId, status) {
    try {
      await backendClient.request(`/receiver/orders/${orderId}/status`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      await loadOrders();
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadOrders();
    const int = setInterval(loadOrders, 5000);
    return () => clearInterval(int);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <h1 className="text-xl font-semibold mb-4">Receiver commandes</h1>
      {error && <p className="text-red-400 mb-3">{error}</p>}
      <div className="space-y-3">
        {orders.map((order) => (
          <div key={order.id} className="border border-gray-700 rounded-lg p-3">
            <div className="flex justify-between">
              <p className="font-medium">{order.orderNumber}</p>
              <p className="text-sm">{order.status}</p>
            </div>
            <p className="text-sm text-gray-300">{order.customerName}</p>
            <div className="flex gap-2 mt-2">
              <button className="px-3 py-1 bg-blue-600 rounded" onClick={() => setStatus(order.id, "accepted")}>Accepter</button>
              <button className="px-3 py-1 bg-green-600 rounded" onClick={() => setStatus(order.id, "ready")}>Prêt</button>
              <button className="px-3 py-1 bg-gray-600 rounded" onClick={() => setStatus(order.id, "completed")}>Terminé</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
