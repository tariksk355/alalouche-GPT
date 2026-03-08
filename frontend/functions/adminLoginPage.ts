import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {

  // POST = login attempt
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { username, password } = body;
    if (!username || !password) return Response.json({ error: "Champs requis" }, { status: 400 });

    const adminPassword = Deno.env.get("ADMIN_PASSWORD");
    if (!adminPassword) return Response.json({ error: "Configuration manquante" }, { status: 500 });

    if (username !== "admin" || password !== adminPassword) {
      return Response.json({ error: "Identifiants incorrects." }, { status: 401 });
    }

    return Response.json({
      ok: true,
      session: { name: "Admin", username: "admin", role: "superadmin", loggedIn: true }
    });
  }

  // GET = serve HTML login page
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Administration</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:380px;width:100%;padding:36px 28px;}
.logo{display:block;height:72px;margin:0 auto 20px;}
h1{text-align:center;font-size:20px;color:#111;margin-bottom:4px;}
.sub{text-align:center;color:#6b7280;font-size:13px;margin-bottom:24px;}
label{display:block;font-size:13px;font-weight:500;color:#374151;margin-bottom:6px;}
input{display:block;width:100%;background:#f9fafb;border:1px solid #d1d5db;color:#111;padding:12px 14px;border-radius:10px;font-size:15px;outline:none;margin-bottom:16px;}
input:focus{border-color:#6b7280;}
.err{background:#fef2f2;border:1px solid #fca5a5;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;display:none;}
button{display:block;width:100%;padding:13px;background:#b5122a;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;}
button:disabled{opacity:0.6;cursor:default;}
</style>
</head>
<body>
<div class="card">
  <img class="logo" src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png" alt="A la louche">
  <h1>Espace Administration</h1>
  <div class="sub">A la louche — Fribourg</div>
  <form id="frm">
    <label>Nom d'utilisateur</label>
    <input id="username" type="text" placeholder="admin" autocomplete="username" required>
    <label>Mot de passe</label>
    <input id="password" type="password" placeholder="••••••••" autocomplete="current-password" required>
    <div class="err" id="errmsg"></div>
    <button type="submit" id="btn">Se connecter</button>
  </form>
</div>
<script>
document.getElementById("frm").onsubmit = function(e) {
  e.preventDefault();
  var btn = document.getElementById("btn");
  var err = document.getElementById("errmsg");
  var u = document.getElementById("username").value.trim();
  var p = document.getElementById("password").value;
  err.style.display = "none";
  btn.disabled = true;
  btn.textContent = "Connexion...";

  var xhr = new XMLHttpRequest();
  xhr.open("POST", "/functions/adminLoginPage", true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    try {
      var data = JSON.parse(xhr.responseText);
      if (data.ok && data.session) {
        try { localStorage.setItem("alalouche_admin", JSON.stringify(data.session)); } catch(x){}
        window.location.href = "/functions/adminDashboardPage";
      } else {
        err.textContent = data.error || "Erreur";
        err.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Se connecter";
      }
    } catch(ex) {
      err.textContent = "Erreur reseau";
      err.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Se connecter";
    }
  };
  xhr.send(JSON.stringify({ username: u, password: p }));
};
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
});