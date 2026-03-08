Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Association peripherique</title>
<style>
  * { margin: 0; padding: 0; -webkit-box-sizing: border-box; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; background: #f9fafb; display: -webkit-flex; display: flex; -webkit-align-items: center; align-items: center; -webkit-justify-content: center; justify-content: center; min-height: 100vh; padding: 24px; }
  .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.1); max-width: 360px; width: 100%; padding: 40px 32px; text-align: center; }
  img { height: 64px; margin: 0 auto 24px; display: block; }
  .icon { font-size: 48px; margin-bottom: 16px; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #111; }
  p { font-size: 14px; color: #6b7280; margin-bottom: 8px; line-height: 1.5; }
  .error-msg { color: #ef4444; }
  .code-label { font-size: 12px; color: #d1d5db; font-family: monospace; margin-top: 12px; }
  .btn { display: block; padding: 12px; background: #b5122a; color: #fff; border-radius: 12px; font-weight: 500; font-size: 14px; text-decoration: none; margin-top: 20px; }
  .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #3b82f6; border-top-color: transparent; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
  @-webkit-keyframes spin { 0%{-webkit-transform:rotate(0deg);}100%{-webkit-transform:rotate(360deg);} }
  @keyframes spin { 0%{-webkit-transform:rotate(0deg);transform:rotate(0deg);}100%{-webkit-transform:rotate(360deg);transform:rotate(360deg);} }
  .spinner { -webkit-animation: spin 0.8s linear infinite; animation: spin 0.8s linear infinite; }
  #waiting, #success, #error-view { display: none; }
  #activating { display: block; }
  #dbgbox { position: fixed; bottom: 0; left: 0; right: 0; background: #000; color: #0f0; font-size: 10px; font-family: monospace; padding: 4px 8px; max-height: 120px; overflow-y: auto; z-index: 9999; display: none; }
  .diag { background: #111; border: 1px solid #374151; border-radius: 8px; padding: 8px; margin-top: 10px; text-align: left; font-size: 10px; font-family: monospace; color: #9ca3af; max-height: 100px; overflow-y: auto; word-break: break-all; }
  #countdown { font-size: 13px; color: #3b82f6; margin-top: 8px; }
</style>
</head>
<body>
<div class="card">
  <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png" alt="A la louche">

  <div id="activating">
    <div class="icon">&#128260;</div>
    <h2>Connexion en cours...</h2>
    <p>Validation du code de provisionnement</p>
  </div>

  <div id="waiting">
    <div class="icon">&#9203;</div>
    <h2>En attente de confirmation</h2>
    <p>Demande envoyee a l'administrateur.<br>Veuillez patienter...</p>
    <div style="margin-top:16px;color:#3b82f6;font-size:14px;">
      <span class="spinner"></span>En attente...
    </div>
    <p class="code-label">Code: ${code}</p>
  </div>

  <div id="success">
    <div class="icon">&#9989;</div>
    <h2>Peripherique associe !</h2>
    <p>Ce peripherique est maintenant autorise.</p>
    <p id="token-preview" style="font-size:11px;color:#9ca3af;word-break:break-all;margin-top:8px;"></p>
    <div id="countdown"></div>
    <div id="success-diag" class="diag"></div>
    <a id="open-btn" href="#" class="btn">Ouvrir la caisse &#8594;</a>
  </div>

  <div id="error-view">
    <div class="icon">&#10060;</div>
    <h2>Erreur</h2>
    <p class="error-msg" id="error-text"></p>
    <p style="font-size:12px;color:#9ca3af;margin-top:16px;">Demandez a l'administrateur de generer un nouveau QR code.</p>
  </div>
</div>

<div id="dbgbox"></div>

<script>
var PROVISION_CODE = "${code}";
var pollInterval = null;
var ACQUIRED_TOKEN = "";

function dbg(msg) {
  var el = document.getElementById("dbgbox");
  if (!el) return;
  el.style.display = "block";
  el.innerHTML = el.innerHTML + "<div>" + msg + "</div>";
  el.scrollTop = el.scrollHeight;
  // Also append to success diag panel if visible
  var sd = document.getElementById("success-diag");
  if (sd) { sd.innerHTML = sd.innerHTML + "<div>" + msg + "</div>"; sd.scrollTop = sd.scrollHeight; }
  try { console.log("[pair] " + msg); } catch(e) {}
}

function show(id) {
  var ids = ["activating", "waiting", "success", "error-view"];
  for (var i = 0; i < ids.length; i++) {
    document.getElementById(ids[i]).style.display = ids[i] === id ? "block" : "none";
  }
}

function showError(msg) {
  show("error-view");
  document.getElementById("error-text").textContent = msg;
  dbg("ERROR: " + msg);
}

function clearStoredToken() {
  try { localStorage.removeItem("device_access_token"); dbg("localStorage cleared: device_access_token"); } catch(e) { dbg("localStorage clear err: " + e.message); }
  try { sessionStorage.removeItem("device_access_token"); dbg("sessionStorage cleared: device_access_token"); } catch(e) { dbg("sessionStorage clear err: " + e.message); }
}

function callApi(payload, cb) {
  dbg("API: " + payload.action);
  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/functions/deviceProvision", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      dbg("API resp " + xhr.status + ": " + xhr.responseText.substring(0, 120));
      try {
        var data = JSON.parse(xhr.responseText);
        cb(null, data);
      } catch(e) {
        cb(e, null);
      }
    }
  };
  xhr.onerror = function() { dbg("XHR network error"); cb(new Error("network"), null); };
  xhr.send(JSON.stringify(payload));
}

function onTokenAcquired(token, expiresAt) {
  ACQUIRED_TOKEN = token;
  dbg("TOKEN acquired len=" + token.length + " prefix=" + token.substring(0, 16));

  // Persist new token to localStorage
  try {
    localStorage.setItem("device_access_token", token);
    var lb = localStorage.getItem("device_access_token");
    dbg("localStorage write: " + (lb === token ? "OK" : "MISMATCH got=" + (lb ? lb.substring(0,8) : "null")));
  } catch(e) { dbg("localStorage write FAILED: " + e.message); }

  // Persist new token to sessionStorage
  try {
    sessionStorage.setItem("device_access_token", token);
    var sb = sessionStorage.getItem("device_access_token");
    dbg("sessionStorage write: " + (sb === token ? "OK" : "MISMATCH"));
  } catch(e) { dbg("sessionStorage write FAILED: " + e.message); }

  // Build target URL with token as query param
  var encoded = encodeURIComponent(token);
  var targetUrl = "/functions/orderReceiverUI?token=" + encoded;

  dbg("target URL: " + targetUrl.substring(0, 80));
  dbg("token len: " + token.length);
  dbg("token prefix: " + token.substring(0, 16));

  // Set button href so manual tap works at any point
  var btn = document.getElementById("open-btn");
  if (btn) { btn.href = targetUrl; }

  var preview = document.getElementById("token-preview");
  if (preview) preview.textContent = "Token: " + token.substring(0, 8) + "... (" + token.length + " chars)";

  show("success");

  // Show 3-second countdown with debug info, then navigate
  var remaining = 3;
  var cdEl = document.getElementById("countdown");
  if (cdEl) cdEl.textContent = "Redirection dans " + remaining + "s...";
  dbg("countdown started, navigating in 3s");

  var cdTimer = setInterval(function() {
    remaining--;
    if (cdEl) cdEl.textContent = remaining > 0 ? "Redirection dans " + remaining + "s..." : "Navigation en cours...";
    if (remaining <= 0) {
      clearInterval(cdTimer);
      dbg("navigating to: " + targetUrl.substring(0, 80));
      window.location.replace(targetUrl);
    }
  }, 1000);
}

function startPolling() {
  pollInterval = setInterval(function() {
    callApi({ action: "poll_status", provision_code: PROVISION_CODE }, function(err, data) {
      if (err || !data) { dbg("poll err: " + (err ? err.message : "no data")); return; }
      dbg("poll status: " + data.status + (data.access_token ? " HAS_TOKEN" : " NO_TOKEN"));
      if (data.status === "active" && data.access_token) {
        clearInterval(pollInterval);
        onTokenAcquired(data.access_token, data.token_expires_at || "");
      } else if (data.status === "revoked") {
        clearInterval(pollInterval);
        showError("Demande rejetee par l'administrateur.");
      }
    });
  }, 3000);
  // Stop polling after 10 minutes
  setTimeout(function() {
    clearInterval(pollInterval);
    dbg("polling timeout after 10 min");
  }, 10 * 60 * 1000);
}

function activate() {
  if (!PROVISION_CODE) {
    showError("Aucun code de provisionnement dans l'URL.");
    return;
  }
  // Clear any stale token before starting a fresh pairing
  dbg("=== NEW PAIRING ATTEMPT ===");
  clearStoredToken();
  dbg("starting activation, code=" + PROVISION_CODE);
  show("activating");
  callApi({ action: "activate", provision_code: PROVISION_CODE }, function(err, data) {
    if (err) { showError("Erreur reseau: " + err.message); return; }
    if (data && data.error) { showError(data.error); return; }
    dbg("activate OK, status=" + (data ? data.status : "?"));
    show("waiting");
    startPolling();
  });
}

activate();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
});