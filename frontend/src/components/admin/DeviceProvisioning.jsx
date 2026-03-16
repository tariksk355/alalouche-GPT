import { useEffect, useRef, useState } from "react";
import {
  confirmPairingRequest,
  createPairingCode,
  listAssociatedDevices,
  listPendingPairingRequests,
  revokeAssociatedDevice,
} from "@/lib/api/devicePairing";

export default function DeviceProvisioning() {
  const [requests, setRequests] = useState([]);
  const [codes, setCodes] = useState([]);
  const [associatedDevices, setAssociatedDevices] = useState([]);
  const [deviceName, setDeviceName] = useState("Sunmi Caisse");
  const [error, setError] = useState("");
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef(null);

  async function loadRequests() {
    setLoadingRequests(true);
    try {
      const [pendingRequests, devices] = await Promise.all([
        listPendingPairingRequests(),
        listAssociatedDevices(),
      ]);
      setRequests(pendingRequests);
      setAssociatedDevices(devices);
      setError("");
    } catch (e) {
      setError(e.message || "Impossible de charger les demandes de pairing.");
    } finally {
      setLoadingRequests(false);
    }
  }

  useEffect(() => {
    loadRequests();

    pollRef.current = setInterval(() => {
      loadRequests();
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  async function generateCode() {
    setBusy(true);
    try {
      const pairingCode = await createPairingCode({ deviceName });
      setCodes((prev) => [pairingCode, ...prev].slice(0, 5));
      setError("");
    } catch (e) {
      setError(e.message || "Impossible de créer un code de pairing.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmRequest(id) {
    setBusy(true);
    try {
      await confirmPairingRequest(id);
      await loadRequests();
      setError("");
    } catch (e) {
      setError(e.message || "Impossible de confirmer la demande.");
    } finally {
      setBusy(false);
    }
  }


  async function onRevokeDevice(deviceId) {
    setBusy(true);
    try {
      await revokeAssociatedDevice(deviceId);
      await loadRequests();
      setError("");
    } catch (e) {
      setError(e.message || "Impossible de désassocier l'appareil.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-3">
        <h3 className="font-semibold">Associer un nouveau périphérique</h3>
        <input value={deviceName} onChange={(e) => setDeviceName(e.target.value)} className="w-full bg-gray-50 border border-gray-200 px-3 py-2 rounded-lg" />
        <button onClick={generateCode} disabled={busy} className="px-4 py-2 bg-[#b5122a] text-white rounded-lg disabled:opacity-60">Générer un code manuel</button>
        <div className="space-y-2">
          {codes.map((c) => (
            <div key={c.pairingCodeId} className="text-sm text-gray-700 font-mono">{c.code} (expire: {new Date(c.expiresAt).toLocaleTimeString("fr-CH")})</div>
          ))}
        </div>
      </div>


      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold mb-4">Appareil associé</h3>
        <div className="space-y-3">
          {associatedDevices.filter((device) => device.status === 'device_active').map((device) => (
            <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 border rounded-lg p-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{device.deviceName || 'Sunmi Receiver'}</p>
                <p className="text-xs text-gray-500">ID: {device.id}</p>
                <p className="text-xs text-gray-500">{device.platform || 'platform inconnue'} {device.deviceModel ? `· ${device.deviceModel}` : ''}</p>
                <p className="text-xs text-gray-400">Dernière activité: {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString('fr-CH') : 'jamais'}</p>
              </div>
              <button onClick={() => onRevokeDevice(device.id)} disabled={busy} className="text-xs px-3 py-2 border border-red-300 text-red-700 rounded hover:bg-red-50 disabled:opacity-60">Desassocier</button>
            </div>
          ))}
          {associatedDevices.filter((device) => device.status === 'device_active').length === 0 && (
            <p className="text-sm text-gray-400">Aucun appareil actif associé.</p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold mb-4">Demandes de pairing en attente</h3>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {loadingRequests && <p className="text-sm text-gray-500 mb-2">Chargement des demandes...</p>}
        <div className="space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="font-medium">{request.deviceName || "Sunmi"}</p>
                <p className="text-xs text-gray-500">{request.status}</p>
              </div>
              <button onClick={() => onConfirmRequest(request.id)} disabled={busy} className="text-sm px-4 py-2 rounded-md font-semibold bg-[#b5122a] text-white shadow-md ring-2 ring-[#b5122a]/20 hover:bg-[#8f0e21] disabled:opacity-60">Confirmer</button>
            </div>
          ))}
          {requests.length === 0 && !loadingRequests && <p className="text-sm text-gray-400">Aucune demande en attente</p>}
        </div>
      </div>
    </div>
  );
}
