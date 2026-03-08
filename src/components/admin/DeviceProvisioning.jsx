import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

function QRCode({ value, size = 200 }) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}&bgcolor=ffffff&color=000000&margin=10`;
  return <img src={url} alt="QR Code" className="rounded-lg border border-gray-200" width={size} height={size} />;
}

export default function DeviceProvisioning() {
  const [devices, setDevices] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [currentProvision, setCurrentProvision] = useState(null); // { device_id, provision_code, expires_at }
  const [timeLeft, setTimeLeft] = useState(0);
  const [deviceName, setDeviceName] = useState("Sunmi Caisse");
  const [revoking, setRevoking] = useState(null);
  const [confirming, setConfirming] = useState(null);

  useEffect(() => {
    loadDevices();
  }, []);

  // Countdown timer for provision code
  useEffect(() => {
    if (!currentProvision) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((new Date(currentProvision.expires_at) - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        setCurrentProvision(null);
        loadDevices();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [currentProvision]);

  // Poll for awaiting_confirmation or active while provision code is active
  useEffect(() => {
    if (!currentProvision) return;
    const poll = setInterval(async () => {
      const devs = await base44.entities.Device.filter({ device_id: currentProvision.device_id });
      if (devs.length > 0) {
        const status = devs[0].status;
        if (status === "awaiting_confirmation" || status === "active") {
          loadDevices();
          if (status === "active") {
            setCurrentProvision(null);
          }
        }
      }
    }, 3000);
    return () => clearInterval(poll);
  }, [currentProvision]);

  const loadDevices = async () => {
    const data = await base44.entities.Device.list("-created_date", 20);
    setDevices(data);
  };

  const generateCode = async () => {
    setGenerating(true);
    try {
      const res = await base44.functions.invoke("deviceProvision", {
        action: "generate",
        device_name: deviceName,
      });
      setCurrentProvision(res.data);
      setTimeLeft(600);
      loadDevices();
    } finally {
      setGenerating(false);
    }
  };

  const confirmDevice = async (device) => {
    setConfirming(device.id);
    try {
      await base44.functions.invoke("deviceProvision", {
        action: "confirm",
        device_id: device.device_id
      });
      // If this is the currently provisioning device, close the QR panel
      if (currentProvision?.device_id === device.device_id) {
        setCurrentProvision(null);
      }
      loadDevices();
    } finally {
      setConfirming(null);
    }
  };

  const rejectDevice = async (device) => {
    if (!confirm(`Rejeter la demande de "${device.name}" ?`)) return;
    setConfirming(device.id);
    try {
      await base44.functions.invoke("deviceProvision", {
        action: "reject",
        device_id: device.device_id
      });
      if (currentProvision?.device_id === device.device_id) {
        setCurrentProvision(null);
      }
      loadDevices();
    } finally {
      setConfirming(null);
    }
  };

  const revokeDevice = async (device) => {
    if (!confirm(`Révoquer "${device.name}" ? Il ne pourra plus recevoir de commandes.`)) return;
    setRevoking(device.id);
    await base44.entities.Device.update(device.id, { status: "revoked", access_token: "" });
    loadDevices();
    setRevoking(null);
  };

  const appBaseUrl = window.location.origin;
  const qrValue = currentProvision
    ? `${appBaseUrl}/functions/devicePairPage?code=${currentProvision.provision_code}`
    : "";

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Get the device currently awaiting confirmation (could be the one we just provisioned or another)
  const pendingConfirmationDevices = devices.filter(d => d.status === "awaiting_confirmation");

  const statusBadge = (status) => {
    const map = {
      pending: "bg-yellow-100 text-yellow-700",
      awaiting_confirmation: "bg-blue-100 text-blue-700",
      active: "bg-green-100 text-green-700",
      revoked: "bg-red-100 text-red-600"
    };
    const labels = {
      pending: "En attente",
      awaiting_confirmation: "Confirmation requise",
      active: "Actif",
      revoked: "Révoqué"
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] || "bg-gray-100 text-gray-600"}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">

      {/* Confirmation alert for awaiting devices */}
      {pendingConfirmationDevices.map(device => (
        <div key={device.id} className="bg-blue-50 border border-blue-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <div className="text-2xl">📱</div>
            <div className="flex-1">
              <p className="font-semibold text-blue-900">Demande d'association en attente</p>
              <p className="text-blue-700 text-sm mt-1">
                <strong>{device.name}</strong> souhaite s'associer à votre système. Confirmez-vous cette demande ?
              </p>
              <p className="text-blue-500 text-xs mt-1 font-mono">{device.device_id?.substring(0, 24)}...</p>
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => confirmDevice(device)}
              disabled={confirming === device.id}
              className="px-5 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-500 disabled:opacity-60 text-sm transition-colors"
            >
              {confirming === device.id ? "..." : "✓ Confirmer l'association"}
            </button>
            <button
              onClick={() => rejectDevice(device)}
              disabled={confirming === device.id}
              className="px-5 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 disabled:opacity-60 text-sm transition-colors"
            >
              ✕ Rejeter
            </button>
          </div>
        </div>
      ))}

      {/* Generate new provision */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h3 className="font-semibold text-lg text-gray-900 mb-4">📱 Associer un nouveau périphérique</h3>

        {!currentProvision ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Nom du périphérique</label>
              <input
                value={deviceName}
                onChange={e => setDeviceName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 text-gray-900 px-3 py-2 rounded-lg focus:outline-none focus:border-gray-400"
                placeholder="Sunmi Caisse"
              />
            </div>
            <button
              onClick={generateCode}
              disabled={generating}
              className="px-6 py-2.5 bg-[#b5122a] text-white rounded-lg font-medium hover:bg-[#8f0e21] disabled:opacity-60 transition-colors"
            >
              {generating ? "Génération..." : "Générer le QR de provisionnement"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex flex-col items-center gap-3">
              <QRCode value={qrValue} size={180} />
              <p className="text-xs text-gray-400">Scannez ce QR avec le Sunmi</p>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Code de provisionnement</p>
                <div className="text-4xl font-mono font-bold tracking-widest text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
                  {currentProvision.provision_code}
                </div>
                <p className="text-xs text-gray-400 mt-1 text-center">Saisir manuellement si le scan ne fonctionne pas</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${timeLeft > 60 ? "bg-green-500" : "bg-red-500"}`} />
                <span className={`text-sm font-medium ${timeLeft > 60 ? "text-green-600" : "text-red-600"}`}>
                  Expire dans {formatTime(timeLeft)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-blue-600">
                <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                En attente du scan par le périphérique...
              </div>
              <button
                onClick={() => { setCurrentProvision(null); loadDevices(); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Device list */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Périphériques enregistrés</h3>
          <button onClick={loadDevices} className="text-xs text-gray-400 hover:text-gray-600">↻ Actualiser</button>
        </div>
        <div className="divide-y divide-gray-100">
          {devices.length === 0 && (
            <div className="text-center py-10 text-gray-400 text-sm">Aucun périphérique enregistré</div>
          )}
          {devices.map(device => (
            <div key={device.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${
                  device.status === "active" ? "bg-green-500" :
                  device.status === "awaiting_confirmation" ? "bg-blue-500 animate-pulse" :
                  device.status === "pending" ? "bg-yellow-400" : "bg-red-400"
                }`} />
                <div>
                  <p className="font-medium text-gray-900">{device.name || "Périphérique"}</p>
                  <p className="text-xs text-gray-400 font-mono">{device.device_id?.substring(0, 16)}...</p>
                  {device.last_seen_at && (
                    <p className="text-xs text-gray-400">
                      Vu: {new Date(device.last_seen_at).toLocaleString("fr-CH", { timeZone: "Europe/Zurich" })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(device.status)}
                {device.status === "awaiting_confirmation" && (
                  <>
                    <button
                      onClick={() => confirmDevice(device)}
                      disabled={confirming === device.id}
                      className="text-xs text-green-600 hover:text-green-700 border border-green-200 px-2 py-1 rounded disabled:opacity-50"
                    >
                      {confirming === device.id ? "..." : "Confirmer"}
                    </button>
                    <button
                      onClick={() => rejectDevice(device)}
                      disabled={confirming === device.id}
                      className="text-xs text-red-500 hover:text-red-600 border border-red-200 px-2 py-1 rounded disabled:opacity-50"
                    >
                      Rejeter
                    </button>
                  </>
                )}
                {device.status === "active" && (
                  <button
                    onClick={() => revokeDevice(device)}
                    disabled={revoking === device.id}
                    className="text-xs text-red-500 hover:text-red-600 border border-red-200 px-2 py-1 rounded disabled:opacity-50"
                  >
                    {revoking === device.id ? "..." : "Révoquer"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}