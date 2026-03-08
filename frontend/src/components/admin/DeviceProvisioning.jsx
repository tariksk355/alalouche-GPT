import { useEffect, useState } from "react";
import { backendClient } from "@/api/backendClient";

export default function DeviceProvisioning() {
  const [requests, setRequests] = useState([]);
  const [codes, setCodes] = useState([]);
  const [deviceName, setDeviceName] = useState("Sunmi Caisse");

  async function loadRequests() {
    const res = await backendClient.request("/admin/device-pairing-requests");
    setRequests(res.data.requests || []);
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function generateCode() {
    const res = await backendClient.request("/admin/device-pairing-codes", {
      method: "POST",
      body: JSON.stringify({ deviceName }),
      headers: { "x-admin-token": import.meta.env.VITE_ADMIN_TOKEN || "dev-admin" },
    });

    setCodes((prev) => [res.data, ...prev].slice(0, 5));
  }

  async function confirmRequest(id) {
    await backendClient.request(`/admin/device-pairing-requests/${id}/confirm`, {
      method: "POST",
      headers: { "x-admin-token": import.meta.env.VITE_ADMIN_TOKEN || "dev-admin" },
    });
    await loadRequests();
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-3">
        <h3 className="font-semibold">Associer un nouveau périphérique</h3>
        <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg" />
        <button onClick={generateCode} className="px-4 py-2 bg-[#b5122a] text-white rounded-lg">Générer un code manuel</button>
        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.pairingCodeId} className="text-sm text-gray-700 font-mono">{c.code} (expire: {new Date(c.expiresAt).toLocaleTimeString("fr-CH")})</div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold mb-4">Demandes de pairing</h3>
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="font-medium">{request.deviceName || "Sunmi"}</p>
                <p className="text-xs text-gray-500">{request.status}</p>
              </div>
              {request.status === "request_pending" && (
                <button onClick={() => confirmRequest(request.id)} className="text-xs px-3 py-1 border rounded">Confirmer</button>
              )}
            </div>
          ))}
          {requests.length === 0 && <p className="text-sm text-gray-400">Aucune demande</p>}
        </div>
      </div>
    </div>
  );
}
