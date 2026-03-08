import { useState, useEffect, useRef } from "react";

export default function DevicePair() {
  const [step, setStep] = useState("init");
  const [errorMsg, setErrorMsg] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const pollRef = useRef(null);

  const code = new URLSearchParams(window.location.search).get("code") || "";

  useEffect(() => {
    if (!code) {
      setStep("error");
      setErrorMsg("Aucun code de provisionnement dans l'URL.");
      return;
    }
    doActivate();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  async function callApi(payload) {
    const url = window.location.origin.replace(/\/$/, "") + "/functions/deviceProvision";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }

  async function doActivate() {
    setStep("activating");
    try {
      const data = await callApi({ action: "activate", provision_code: code });
      if (data && data.error) {
        setStep("error");
        setErrorMsg(data.error);
        return;
      }
      setStep("waiting");
      startPolling();
    } catch (e) {
      setStep("error");
      setErrorMsg(String(e));
    }
  }

  function startPolling() {
    const interval = setInterval(async () => {
      try {
        const data = await callApi({ action: "poll_status", provision_code: code });
        if (data && data.status === "active" && data.access_token) {
          clearInterval(interval);
          localStorage.setItem("device_access_token", data.access_token);
          localStorage.setItem("device_token_expires_at", data.token_expires_at || "");
          setAccessToken(data.access_token);
          setStep("success");
        } else if (data && data.status === "revoked") {
          clearInterval(interval);
          setStep("error");
          setErrorMsg("Demande rejetée par l'administrateur.");
        }
      } catch (e) {
        // continue polling
      }
    }, 3000);
    pollRef.current = interval;
    setTimeout(() => clearInterval(interval), 10 * 60 * 1000);
  }

  const containerStyle = {
    minHeight: "100vh",
    background: "#f9fafb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    fontFamily: "Arial, sans-serif",
  };

  const cardStyle = {
    background: "#fff",
    borderRadius: "16px",
    boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
    maxWidth: "360px",
    width: "100%",
    padding: "40px 32px",
    textAlign: "center",
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <img
          src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png"
          alt="À la louche"
          style={{ height: "64px", margin: "0 auto 24px", display: "block" }}
        />

        {step === "init" && (
          <p style={{ color: "#6b7280" }}>Chargement...</p>
        )}

        {step === "activating" && (
          <>
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>🔄</div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>Connexion en cours...</h2>
            <p style={{ fontSize: "14px", color: "#6b7280" }}>Validation du code de provisionnement</p>
          </>
        )}

        {step === "waiting" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>En attente de confirmation</h2>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "16px" }}>
              Demande envoyée à l&apos;administrateur.<br />
              Veuillez patienter...
            </p>
            <p style={{ fontSize: "12px", color: "#d1d5db", fontFamily: "monospace" }}>Code: {code}</p>
          </>
        )}

        {step === "success" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>Périphérique associé !</h2>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
              Ce périphérique est maintenant autorisé.
            </p>
            <a
              href="/OrderReceiver"
              style={{
                display: "block",
                padding: "12px",
                background: "#b5122a",
                color: "#fff",
                borderRadius: "12px",
                fontWeight: "500",
                fontSize: "14px",
                textDecoration: "none",
              }}
            >
              Ouvrir l&apos;application caisse →
            </a>
          </>
        )}

        {step === "error" && (
          <>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>❌</div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>Erreur</h2>
            <p style={{ fontSize: "14px", color: "#ef4444" }}>{errorMsg}</p>
            <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "16px" }}>
              Demandez à l&apos;administrateur de générer un nouveau QR code.
            </p>
          </>
        )}
      </div>
    </div>
  );
}