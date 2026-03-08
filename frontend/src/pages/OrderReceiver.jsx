import { useEffect, useRef, useState } from "react";
import { getDeviceMe, getReceiverOrders, updateOrderStatus } from "@/lib/api/receiver";
import { clearDeviceToken, getDeviceToken } from "@/lib/deviceTokenStore";

// Sunmi-friendly receiver note:
// - Uses stored token + API verification (no query-param token flow)
// - Uses simple polling instead of realtime for reliability on constrained devices
// - Keeps dependencies minimal

export default function OrderReceiver() {
  const [orders, setOrders] = useState([]);
  const [deviceState, setDeviceState] = useState("loading"); // loading | not_paired | verifying | server_error | loaded
  const [errorMessage, setErrorMessage] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const pollRef = useRef(null);
  const requestInFlightRef = useRef(false);

  async function loadOrdersWithDeviceValidation() {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    const token = getDeviceToken();

    if (!token) {
      setDeviceState("not_paired");
      setErrorMessage("");
      requestInFlightRef.current = false;
      return;
    }

    try {
      setDeviceState((prev) => (prev === "loaded" ? prev : "verifying"));
      const device = await getDeviceMe(token);
      setDeviceName(device?.deviceName || "Périphérique");

      const list = await getReceiverOrders(token);
      setOrders(list);
      setErrorMessage("");
      setDeviceState("loaded");
    } catch (e) {
      const msg = e.message || "Erreur serveur.";

      if (e.code === "DEVICE_TOKEN_INVALID" || e.code === "DEVICE_AUTH_REQUIRED") {
        clearDeviceToken();
        setDeviceState("not_paired");
        setErrorMessage("Périphérique non associé ou token invalide. Refaire l'association.");
      } else {
        setDeviceState("server_error");
        setErrorMessage(msg);
      }
    } finally {
      requestInFlightRef.current = false;
    }
  }

  async function setStatus(orderId, status) {
    const token = getDeviceToken();
    if (!token) {
      setDeviceState("not_paired");
      return;
    }

    try {
      await updateOrderStatus(token, orderId, status);
      await loadOrdersWithDeviceValidation();
    } catch (e) {
      setDeviceState("server_error");
      setErrorMessage(e.message || "Impossible de mettre à jour la commande.");
    }
  }

  useEffect(() => {
    loadOrdersWithDeviceValidation();

    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      loadOrdersWithDeviceValidation();
    }, 5000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, []);

  if (deviceState === "loading") {
    return <div className="min-h-screen bg-gray-950 text-white p-4">Chargement du receiver...</div>;
  }

  if (deviceState === "verifying") {
    return <div className="min-h-screen bg-gray-950 text-white p-4">Vérification du périphérique...</div>;
  }

  if (deviceState === "not_paired") {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <h1 className="text-xl font-semibold mb-4">Receiver commandes</h1>
        <p className="text-yellow-300">Appareil non associé.</p>
        <p className="text-gray-300 mt-2">Ouvrez la page d'association de périphérique et entrez le code admin.</p>
        {errorMessage && <p className="text-red-400 mt-3">{errorMessage}</p>}
      </div>
    );
  }

  if (deviceState === "server_error") {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4">
        <h1 className="text-xl font-semibold mb-4">Receiver commandes</h1>
        <p className="text-red-400">Erreur serveur: {errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4">
      <h1 className="text-xl font-semibold mb-1">Receiver commandes</h1>
      <p className="text-sm text-gray-400 mb-4">Connecté: {deviceName}</p>
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
        {orders.length === 0 && <p className="text-gray-400">Aucune commande en attente.</p>}
      </div>
    </div>
  );
}
