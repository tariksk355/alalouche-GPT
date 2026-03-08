import { useEffect, useRef, useState } from "react";
import { createPairingRequest, verifyDevice } from "@/lib/api/devicePairing";
import { setDeviceToken } from "@/lib/deviceTokenStore";

export default function DevicePair() {
  const [step, setStep] = useState("init"); // init | activating | waiting | success | error
  const [errorMsg, setErrorMsg] = useState("");
  const [pairingCode, setPairingCode] = useState(new URLSearchParams(window.location.search).get("code") || "");
  const [pairingRequestId, setPairingRequestId] = useState(null);
  const pollIntervalRef = useRef(null);
  const pollTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, []);

  async function startPairing() {
    if (!pairingCode.trim()) {
      setErrorMsg("Veuillez saisir un code d'association.");
      setStep("error");
      return;
    }

    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);

    setStep("activating");
    setErrorMsg("");

    try {
      const res = await createPairingRequest({
        pairingCode: pairingCode.trim().toUpperCase(),
        deviceName: "Sunmi Receiver",
        deviceModel: "Unknown",
        platform: "android",
        appVersion: "v1",
        installId: crypto.randomUUID(),
      });

      setPairingRequestId(res.pairingRequestId);
      setStep("waiting");
      startPolling(res.pairingRequestId);
    } catch (e) {
      setStep("error");
      setErrorMsg(e.message || "Impossible de créer la demande d'association.");
    }
  }

  function startPolling(requestId) {
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await verifyDevice(requestId);

        if (res.status === "device_active" && res.deviceToken) {
          setDeviceToken(res.deviceToken);
          setStep("success");
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          return;
        }

        if (res.status === "device_expired" || res.status === "device_revoked") {
          setErrorMsg("La demande d'association n'est plus valide.");
          setStep("error");
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
      } catch {
        // keep polling quietly; transient connectivity issues should not break pairing immediately
      }
    }, 3000);

    pollTimeoutRef.current = setTimeout(() => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setErrorMsg("Délai dépassé. Vérifiez la connexion et recommencez l'association.");
      setStep("error");
    }, 10 * 60 * 1000);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.10)", maxWidth: 380, width: "100%", padding: "32px 28px", textAlign: "center" }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>Association périphérique</h2>

        {(step === "init" || step === "error") && (
          <>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "12px 0" }}>Saisissez le code fourni par l'administrateur.</p>
            <input
              value={pairingCode}
              onChange={(e) => setPairingCode(e.target.value)}
              placeholder="Ex: AB12CD"
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12, marginBottom: 12, textTransform: "uppercase" }}
            />
            <button onClick={startPairing} style={{ width: "100%", background: "#b5122a", color: "#fff", borderRadius: 10, padding: 12 }}>
              Associer l'appareil
            </button>
          </>
        )}

        {step === "activating" && <p style={{ marginTop: 16 }}>Création de la demande...</p>}
        {step === "waiting" && <p style={{ marginTop: 16 }}>Demande envoyée. En attente de confirmation admin...</p>}
        {step === "success" && (
          <a href="/OrderReceiver" style={{ display: "block", marginTop: 16, background: "#111827", color: "#fff", borderRadius: 10, padding: 12, textDecoration: "none" }}>
            Ouvrir le receiver
          </a>
        )}

        {errorMsg && <p style={{ marginTop: 12, color: "#dc2626", fontSize: 14 }}>{errorMsg}</p>}
        {pairingRequestId && <p style={{ marginTop: 8, fontSize: 12, color: "#9ca3af", fontFamily: "monospace" }}>{pairingRequestId}</p>}
      </div>
    </div>
  );
}
