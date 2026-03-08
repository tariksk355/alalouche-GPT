import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // ── API endpoint ──
  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { action } = body;

    if (action === "load_orders") {
      const orders = await base44.asServiceRole.entities.Order.list("-created_date", 100);
      return Response.json({ orders });
    }
    if (action === "update_order") {
      const { order_id, status, prep_minutes } = body;
      const updates = {};
      if (status) updates.status = status;
      if (prep_minutes) {
        updates.prep_time_minutes = prep_minutes;
        updates.ready_at = new Date(Date.now() + prep_minutes * 60000).toISOString();
        updates.status = "accepted";
        // Reset printed flag so Sunmi auto-prints this order
        updates.printed = false;
        updates.printed_at = null;
      }
      await base44.asServiceRole.entities.Order.update(order_id, updates);
      return Response.json({ ok: true });
    }
    if (action === "load_menu") {
      const items = await base44.asServiceRole.entities.MenuItem.list("sort_order", 200);
      return Response.json({ items });
    }
    if (action === "save_menu_item") {
      const { item_id, data } = body;
      if (item_id) {
        await base44.asServiceRole.entities.MenuItem.update(item_id, data);
      } else {
        await base44.asServiceRole.entities.MenuItem.create(data);
      }
      return Response.json({ ok: true });
    }
    if (action === "delete_menu_item") {
      await base44.asServiceRole.entities.MenuItem.delete(body.item_id);
      return Response.json({ ok: true });
    }
    if (action === "toggle_menu_item") {
      const items = await base44.asServiceRole.entities.MenuItem.filter({ id: body.item_id });
      if (items.length > 0) {
        await base44.asServiceRole.entities.MenuItem.update(body.item_id, { available: !items[0].available });
      }
      return Response.json({ ok: true });
    }
    if (action === "load_reservations") {
      const reservations = await base44.asServiceRole.entities.Reservation.list("-created_date", 100);
      return Response.json({ reservations });
    }
    if (action === "update_reservation") {
      await base44.asServiceRole.entities.Reservation.update(body.reservation_id, { status: body.status });
      return Response.json({ ok: true });
    }
    if (action === "load_customers") {
      const customers = await base44.asServiceRole.entities.Customer.list("-total_orders", 200);
      return Response.json({ customers });
    }
    if (action === "load_settings") {
      const list = await base44.asServiceRole.entities.PrinterSettings.list();
      return Response.json({ settings: list[0] || null });
    }
    if (action === "save_settings") {
      const { settings } = body;
      if (settings.id) {
        await base44.asServiceRole.entities.PrinterSettings.update(settings.id, settings);
      } else {
        await base44.asServiceRole.entities.PrinterSettings.create(settings);
      }
      return Response.json({ ok: true });
    }
    if (action === "generate_provision") {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code = "";
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
      const deviceId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await base44.asServiceRole.entities.Device.create({
        device_id: deviceId, name: body.device_name || "Sunmi",
        provision_code: code, provision_code_expires_at: expiresAt,
        provision_code_used: false, status: "pending"
      });
      return Response.json({ device_id: deviceId, provision_code: code, expires_at: expiresAt });
    }
    if (action === "load_devices") {
      const devices = await base44.asServiceRole.entities.Device.list("-created_date", 20);
      return Response.json({ devices });
    }
    if (action === "confirm_device") {
      const devs = await base44.asServiceRole.entities.Device.filter({ device_id: body.device_id });
      if (devs.length > 0) {
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2,"0")).join("");
        await base44.asServiceRole.entities.Device.update(devs[0].id, {
          provision_code_used: true, access_token: token,
          token_expires_at: new Date(Date.now() + 365*24*60*60*1000).toISOString(),
          status: "active", last_seen_at: new Date().toISOString()
        });
      }
      return Response.json({ ok: true });
    }
    if (action === "reject_device") {
      const devs = await base44.asServiceRole.entities.Device.filter({ device_id: body.device_id });
      if (devs.length > 0) await base44.asServiceRole.entities.Device.update(devs[0].id, { status: "revoked", provision_code_used: true });
      return Response.json({ ok: true });
    }
    if (action === "load_stats") {
      const [orders, reservations, customers] = await Promise.all([
        base44.asServiceRole.entities.Order.list("-created_date", 200),
        base44.asServiceRole.entities.Reservation.list("-created_date", 50),
        base44.asServiceRole.entities.Customer.list()
      ]);
      const today = new Date().toISOString().split("T")[0];
      return Response.json({
        totalOrders: orders.length,
        todayOrders: orders.filter(o => o.created_date?.startsWith(today)).length,
        totalReservations: reservations.length,
        totalCustomers: customers.length
      });
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  }

  // ── Serve HTML ──
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Administration — A la louche</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:Arial,sans-serif;background:#f3f4f6;color:#111;}
a{color:inherit;text-decoration:none;}

/* Layout */
#wrapper{display:flex;min-height:100vh;}
#sidebar{width:220px;background:#fff;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;flex-shrink:0;}
#sidebar .logo{padding:20px 16px;border-bottom:1px solid #e5e7eb;}
#sidebar .logo img{height:48px;}
#sidebar .admin-name{font-size:13px;color:#6b7280;margin-top:6px;}
#sidebar nav{flex:1;padding:12px 8px;overflow-y:auto;}
.nav-btn{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border:none;background:none;border-radius:8px;cursor:pointer;font-size:14px;color:#374151;text-align:left;margin-bottom:2px;}
.nav-btn:hover{background:#f3f4f6;}
.nav-btn.active{background:#b5122a;color:#fff;}
#sidebar .logout{padding:12px 16px;border-top:1px solid #e5e7eb;}
.logout-btn{background:none;border:none;font-size:13px;color:#9ca3af;cursor:pointer;padding:6px 0;}
.logout-btn:hover{color:#111;}

#main{flex:1;display:flex;flex-direction:column;min-width:0;}
header{background:#fff;border-bottom:1px solid #e5e7eb;padding:14px 24px;display:flex;align-items:center;gap:12px;}
header h1{font-size:17px;font-weight:600;}
#content{flex:1;padding:20px 24px;overflow:auto;}

/* Mobile sidebar */
#overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:40;}
#hamburger{background:none;border:none;font-size:22px;cursor:pointer;padding:0;margin-right:8px;}
@media(max-width:768px){
  #sidebar{position:fixed;left:-220px;top:0;bottom:0;z-index:50;transition:left 0.25s;width:220px;}
}

/* Cards */
.card{background:#fff;border-radius:12px;border:1px solid #e5e7eb;padding:20px;margin-bottom:12px;box-shadow:0 1px 3px rgba(0,0,0,0.06);}
.card.border-yellow{border-color:#eab308;}
.card.border-blue{border-color:#3b82f6;}
.card.border-green{border-color:#22c55e;}

/* Buttons */
.btn{display:inline-block;padding:8px 14px;border:none;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;transition:opacity 0.15s;}
.btn:hover{opacity:0.85;}
.btn:disabled{opacity:0.5;cursor:default;}
.btn-red{background:#b5122a;color:#fff;}
.btn-green{background:#16a34a;color:#fff;}
.btn-blue{background:#2563eb;color:#fff;}
.btn-gray{background:#e5e7eb;color:#374151;}
.btn-yellow{background:#eab308;color:#000;}
.btn-sm{padding:5px 10px;font-size:12px;}

/* Filters row */
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
.fbtn{padding:7px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;color:#374151;}
.fbtn.active{background:#b5122a;color:#fff;border-color:#b5122a;}

/* Order card details */
.order-header{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px;}
.onum{font-size:15px;font-weight:700;}
.obadge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;}
.b-new{background:#eab308;color:#000;}
.b-accepted{background:#3b82f6;}
.b-ready{background:#22c55e;}
.b-completed{background:#9ca3af;}
.b-cancelled{background:#ef4444;}
.oinfo{color:#6b7280;font-size:13px;margin-top:2px;}
.prepbox{background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin:10px 0;}
.prepbtns{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;}
.readytime{color:#2563eb;font-size:13px;margin:6px 0;}
.actrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
.details-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:14px;padding-top:14px;border-top:1px solid #f3f4f6;font-size:13px;}
@media(max-width:600px){.details-grid{grid-template-columns:1fr;}}
.item-row{display:flex;justify-content:space-between;color:#374151;margin-bottom:4px;}
.total-row{display:flex;justify-content:space-between;font-weight:700;border-top:1px solid #e5e7eb;padding-top:6px;margin-top:6px;}

/* Menu */
.menu-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;}
@media(max-width:768px){.menu-grid{grid-template-columns:1fr;}}
.form-row{margin-bottom:12px;}
.form-row label{display:block;font-size:12px;color:#6b7280;margin-bottom:4px;}
.form-row input,.form-row select,.form-row textarea{width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;background:#f9fafb;outline:none;}
.form-row input:focus,.form-row select:focus,.form-row textarea:focus{border-color:#9ca3af;}
.form-row-2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.menu-item-row{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:6px;background:#fff;}
.menu-item-row img{width:44px;height:44px;object-fit:cover;border-radius:6px;flex-shrink:0;}
.menu-item-info{flex:1;min-width:0;}
.menu-item-name{font-weight:500;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.menu-item-sub{font-size:12px;color:#9ca3af;}
.dot-green{width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;margin-right:4px;}
.dot-gray{width:8px;height:8px;background:#d1d5db;border-radius:50%;display:inline-block;margin-right:4px;}

/* Res/Clients */
.res-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;box-shadow:0 1px 3px rgba(0,0,0,0.04);}
.res-name{font-size:15px;font-weight:600;}
.res-info{font-size:13px;color:#6b7280;margin-top:2px;}
.badge{display:inline-block;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;}
.b-pending{background:#eab308;color:#000;}
.b-confirmed{background:#22c55e;}
.b-cancelled{background:#ef4444;}

/* Toast */
#toast{position:fixed;top:16px;right:16px;background:#16a34a;color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;display:none;z-index:99;max-width:300px;}

/* Stats */
.stats-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;}
@media(max-width:600px){.stats-row{grid-template-columns:repeat(2,1fr);}}
.stat-card{background:#fff;border-radius:10px;padding:14px;text-align:center;border:1px solid #e5e7eb;}
.stat-num{font-size:24px;font-weight:700;color:#b5122a;}
.stat-lbl{font-size:12px;color:#9ca3af;margin-top:4px;}

/* Toggle */
.toggle{width:44px;height:24px;background:#d1d5db;border-radius:12px;position:relative;cursor:pointer;border:none;transition:background 0.2s;flex-shrink:0;}
.toggle.on{background:#b5122a;}
.toggle::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;background:#fff;border-radius:50%;transition:transform 0.2s;}
.toggle.on::after{transform:translateX(20px);}

/* Search */
.search-row{display:flex;gap:8px;margin-bottom:16px;}
.search-row input{flex:1;padding:9px 14px;border:1px solid #e5e7eb;border-radius:8px;font-size:14px;background:#fff;outline:none;}

/* QR */
.qr-box{text-align:center;padding:16px;background:#f9fafb;border-radius:10px;border:1px solid #e5e7eb;margin-top:12px;}
.qr-code{font-size:32px;font-weight:700;letter-spacing:6px;color:#b5122a;font-family:monospace;}

/* Scrollable list */
.scroll-list{max-height:500px;overflow-y:auto;}

/* Success bar */
.success-bar{background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:14px;display:none;}
</style>
</head>
<body>
<div id="toast"></div>

<div id="wrapper">
  <div id="overlay" onclick="closeSidebar()" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:40;"></div>

  <div id="sidebar">
    <div class="logo">
      <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png" alt="A la louche">
      <div class="admin-name" id="admin-name"></div>
    </div>
    <nav>
      <button class="nav-btn active" onclick="switchTab('orders')" id="nb-orders">🛒 Commandes</button>
      <button class="nav-btn" onclick="switchTab('menu')" id="nb-menu">🍽️ Menu</button>
      <button class="nav-btn" onclick="switchTab('reservations')" id="nb-reservations">📅 Réservations</button>
      <button class="nav-btn" onclick="switchTab('customers')" id="nb-customers">👥 Clients</button>
      <button class="nav-btn" onclick="switchTab('analytics')" id="nb-analytics">📊 Analytiques</button>
      <button class="nav-btn" onclick="switchTab('settings')" id="nb-settings">⚙️ Paramètres</button>
    </nav>
    <div class="logout">
      <button class="logout-btn" onclick="doLogout()">Se déconnecter</button>
    </div>
  </div>

  <div id="main">
    <header>
      <button id="hamburger" onclick="openSidebar()" style="background:none;border:none;font-size:22px;cursor:pointer;padding:4px 8px;margin-right:8px;">&#9776;</button>
      <h1 id="header-title">Commandes</h1>
    </header>
    <div id="content"></div>
  </div>
</div>

<script>
var API = "/functions/adminDashboardPage";
var admin = null;

/* ── Auth ── */
function doLogout() {
  try { localStorage.removeItem("alalouche_admin"); } catch(e){}
  window.location.href = "/functions/adminLoginPage";
}

function checkAuth() {
  try {
    var s = localStorage.getItem("alalouche_admin");
    if (s) admin = JSON.parse(s);
  } catch(e){}
  if (!admin || !admin.loggedIn) { window.location.href = "/functions/adminLoginPage"; return false; }
  var nameEl = document.getElementById("admin-name");
  if (nameEl) nameEl.textContent = admin.name || admin.username;
  return true;
}

/* ── Sidebar ── */
function openSidebar() {
  var sb = document.getElementById("sidebar");
  var ov = document.getElementById("overlay");
  if (sb) sb.style.left = "0";
  if (ov) ov.style.display = "block";
}
function closeSidebar() {
  var sb = document.getElementById("sidebar");
  var ov = document.getElementById("overlay");
  if (sb) sb.style.left = "-220px";
  if (ov) ov.style.display = "none";
}

/* ── Tab nav ── */
var currentTab = "orders";
var TAB_LABELS = {orders:"Commandes",menu:"Menu",reservations:"Réservations",customers:"Clients",analytics:"Analytiques",settings:"Paramètres"};
var ALL_TABS = ["orders","menu","reservations","customers","analytics","settings"];
function switchTab(tab) {
  currentTab = tab;
  for (var i=0;i<ALL_TABS.length;i++) {
    var btn = document.getElementById("nb-"+ALL_TABS[i]);
    if (btn) { btn.style.background = ALL_TABS[i]===tab ? "#b5122a" : ""; btn.style.color = ALL_TABS[i]===tab ? "#fff" : "#374151"; }
  }
  var ht = document.getElementById("header-title");
  if (ht) ht.textContent = TAB_LABELS[tab] || tab;
  closeSidebar();
  if (tab === "orders") renderOrders();
  else if (tab === "menu") renderMenu();
  else if (tab === "reservations") renderReservations();
  else if (tab === "customers") renderCustomers();
  else if (tab === "analytics") renderAnalytics();
  else if (tab === "settings") renderSettings();
}

/* ── API helper ── */
function post(payload, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", API, true);
  xhr.setRequestHeader("Content-Type","application/json");
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== 4) return;
    try { cb(null, JSON.parse(xhr.responseText)); }
    catch(e) { cb(e, null); }
  };
  xhr.onerror = function(){ cb(new Error("network"), null); };
  xhr.send(JSON.stringify(payload));
}

/* ── Toast ── */
function toast(msg, isErr) {
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.style.background = isErr ? "#dc2626" : "#16a34a";
  el.style.display = "block";
  setTimeout(function(){ el.style.display="none"; }, 3500);
}

/* ── Helpers ── */
function esc(s){ if(!s) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function fmtTime(iso){ if(!iso) return "--"; var d=new Date(iso); var h=d.getHours(),m=d.getMinutes(); return (h<10?"0"+h:h)+":"+(m<10?"0"+m:m); }
function fmtDate(iso){ if(!iso) return "--"; var d=new Date(iso); return d.getDate()+"."+(d.getMonth()+1)+"."+d.getFullYear(); }
function fmtAmt(n){ return "CHF "+(parseFloat(n)||0).toFixed(2); }
function el(id){ return document.getElementById(id); }
function setHTML(id,html){ var e=el(id); if(e) e.innerHTML=html; }

/* ══════════════ ORDERS ══════════════ */
var ordersData = [];
var ordersFilter = "all";
var openOrderId = null;

function renderOrders() {
  var c = el("content");
  c.innerHTML = '<div id="orders-success" class="success-bar"></div>'+
    '<div class="filters" id="order-filters"></div>'+
    '<div id="orders-list"><div style="text-align:center;padding:40px;color:#9ca3af;">Chargement...</div></div>';
  ordersFilter = "all";
  openOrderId = null;
  post({action:"load_orders"}, function(err, data) {
    if (err || !data) { toast("Erreur chargement commandes", true); return; }
    ordersData = data.orders || [];
    rebuildOrderFilters();
    rebuildOrderList();
  });
}

function rebuildOrderFilters() {
  var newCount = ordersData.filter(function(o){return o.status==="new";}).length;
  var filters = ["all","new","accepted","ready","completed"];
  var labels = {all:"Toutes",new:"Nouveau",accepted:"Accepté",ready:"Prêt",completed:"Terminé"};
  var html = "";
  for (var i=0;i<filters.length;i++) {
    var f=filters[i];
    var badge = (f==="new" && newCount>0) ? '<span style="margin-left:4px;background:#fff;color:#b5122a;border-radius:10px;padding:0 5px;font-size:11px;font-weight:700;">'+newCount+'</span>' : "";
    html += '<button class="fbtn" style="'+(ordersFilter===f?"background:#b5122a;color:#fff;border-color:#b5122a;":"")+'" onclick="setOrderFilter(\''+f+'\')">'+labels[f]+badge+'</button>';
  }
  setHTML("order-filters", html);
}

function setOrderFilter(f) {
  ordersFilter = f;
  openOrderId = null;
  rebuildOrderFilters();
  rebuildOrderList();
}

function rebuildOrderList() {
  var STATUS_LABELS = {new:"Nouveau",accepted:"Accepté",ready:"Prêt",completed:"Terminé",cancelled:"Annulé"};
  var STATUS_B = {new:"b-new",accepted:"b-accepted",ready:"b-ready",completed:"b-completed",cancelled:"b-cancelled"};
  var filtered = ordersFilter==="all" ? ordersData : ordersData.filter(function(o){return o.status===ordersFilter;});
  if (filtered.length === 0) { setHTML("orders-list","<div style='text-align:center;padding:40px;color:#9ca3af;'>Aucune commande.</div>"); return; }
  var html = "";
  for (var i=0;i<filtered.length;i++) {
    var o = filtered[i];
    var isOpen = openOrderId === o.id;
    var bclass = STATUS_B[o.status] || "";
    var prep = "";
    if (o.status==="new") {
      prep = '<div class="prepbox"><div style="font-size:13px;font-weight:600;color:#92400e;">⚠️ Sélectionner le temps de préparation</div>'+
        '<div class="prepbtns">'+
        '<button class="btn btn-yellow" onclick="setPrepTime(\''+o.id+'\',15)">15 min</button>'+
        '<button class="btn btn-yellow" onclick="setPrepTime(\''+o.id+'\',30)">30 min</button>'+
        '<button class="btn btn-yellow" onclick="setPrepTime(\''+o.id+'\',45)">45 min</button>'+
        '<button class="btn btn-yellow" onclick="setPrepTime(\''+o.id+'\',60)">60 min</button>'+
        '</div></div>';
    }
    var readyline = "";
    if (o.status==="accepted" && o.ready_at) {
      readyline = '<div class="readytime">⏱ Prêt à: '+fmtTime(o.ready_at)+(o.prep_time_minutes?" ("+o.prep_time_minutes+" min)":"")+"</div>";
    }
    var acts = '<div class="actrow">';
    if (o.status==="accepted") acts += '<button class="btn btn-green" onclick="setOrderStatus(\''+o.id+'\',\'ready\')">✓ Marquer prêt</button>';
    if (o.status==="ready") acts += '<button class="btn btn-gray" onclick="setOrderStatus(\''+o.id+'\',\'completed\')">✓ Terminer</button>';
    acts += '</div>';
    var detail = "";
    if (isOpen) {
      var items = "";
      if (o.items) { for(var j=0;j<o.items.length;j++){ var it=o.items[j]; items+='<div class="item-row"><span>'+esc(it.name)+' x'+it.quantity+'</span><span>'+fmtAmt(it.price*it.quantity)+'</span></div>'; } }
      items += '<div class="total-row"><span>Total</span><span>'+fmtAmt(o.total_amount)+'</span></div>';
      var extra = "";
      if (o.customer_address) extra += '<div style="color:#374151;"><span style="color:#9ca3af;">Adresse: </span>'+esc(o.customer_address)+'</div>';
      if (o.notes) extra += '<div style="margin-top:6px;color:#374151;"><span style="color:#9ca3af;">Notes: </span>'+esc(o.notes)+'</div>';
      detail = '<div class="details-grid"><div>'+items+'</div><div>'+extra+'</div></div>';
    }
    var borderClass = o.status==="new"?"border-yellow":o.status==="accepted"?"border-blue":o.status==="ready"?"border-green":"";
    html += '<div class="card '+borderClass+'">'+
      '<div class="order-header">'+
        '<div><span class="onum">'+esc(o.order_number)+'</span> <span class="obadge '+bclass+'">'+STATUS_LABELS[o.status]+'</span>'+
        '<div class="oinfo">'+esc(o.customer_name)+' · '+esc(o.customer_phone)+'</div>'+
        '<div style="font-size:12px;color:#9ca3af;">'+(o.order_type==="takeaway"?"À emporter":"Livraison")+' · '+(o.payment_method==="cash"?"Espèces":"Carte")+' · '+fmtAmt(o.total_amount)+'</div>'+
        '<div style="font-size:11px;color:#9ca3af;">Reçu à '+fmtTime(o.created_date)+'</div>'+
        '</div>'+
        '<button class="btn btn-gray btn-sm" onclick="toggleOrder(\''+o.id+'\')">'+( isOpen?"Fermer":"Détails")+'</button>'+
      '</div>'+
      prep+readyline+detail+acts+
    '</div>';
  }
  setHTML("orders-list", html);
}

function toggleOrder(id) { openOrderId = (openOrderId===id) ? null : id; rebuildOrderList(); }

function setPrepTime(id, mins) {
  post({action:"update_order",order_id:id,prep_minutes:mins}, function(err,data){
    if (err) { toast("Erreur",true); return; }
    post({action:"load_orders"}, function(err2,d2){
      if (d2) ordersData = d2.orders||[];
      openOrderId = null;
      rebuildOrderFilters();
      rebuildOrderList();
      toast("Commande acceptée — prête dans "+mins+" min ✓");
    });
  });
}

function setOrderStatus(id, status) {
  post({action:"update_order",order_id:id,status:status}, function(err,data){
    if (err) { toast("Erreur",true); return; }
    post({action:"load_orders"}, function(err2,d2){
      if (d2) ordersData = d2.orders||[];
      rebuildOrderFilters();
      rebuildOrderList();
      var labels={ready:"Commande marquée prête ✓",completed:"Commande terminée ✓"};
      toast(labels[status]||"Mis à jour ✓");
    });
  });
}

/* ══════════════ MENU ══════════════ */
var menuItems = [];
var menuEditId = null;
var CATEGORIES = ["Sandwichs et menu","Nos sauces chaudes","Nos sauces froides","Plats et Pide","Boissons","Bières & Alcools","Vins","Desserts"];

function renderMenu() {
  var c = el("content");
  var catOpts = CATEGORIES.map(function(cat){ return '<option value="'+esc(cat)+'">'+esc(cat)+'</option>'; }).join("");
  c.innerHTML = '<div class="menu-grid">'+
    '<div class="card">'+
      '<h2 id="menu-form-title" style="font-size:16px;font-weight:600;margin-bottom:16px;">Ajouter un article</h2>'+
      '<div id="menu-success" class="success-bar"></div>'+
      '<div class="form-row-2">'+
        '<div class="form-row" style="grid-column:span 2;"><label>Nom *</label><input id="mf-name" required></div>'+
        '<div class="form-row"><label>Prix (CHF) *</label><input id="mf-price" type="number" step="0.5" min="0"></div>'+
        '<div class="form-row"><label>Catégorie</label><select id="mf-cat">'+catOpts+'</select></div>'+
        '<div class="form-row" style="grid-column:span 2;"><label>Description</label><textarea id="mf-desc" rows="2" style="resize:none;"></textarea></div>'+
        '<div class="form-row" style="grid-column:span 2;"><label>Allergènes</label><input id="mf-allergens" placeholder="Gluten, lactose..."></div>'+
        '<div class="form-row" style="grid-column:span 2;"><label>URL image</label><input id="mf-img" placeholder="https://..."></div>'+
      '</div>'+
      '<div style="display:flex;gap:8px;margin-top:8px;">'+
        '<button class="btn btn-red" style="flex:1;" onclick="saveMenuItem()">Ajouter</button>'+
        '<button class="btn btn-gray" id="menu-cancel-btn" style="display:none;" onclick="cancelMenuEdit()">Annuler</button>'+
      '</div>'+
    '</div>'+
    '<div>'+
      '<h2 style="font-size:16px;font-weight:600;margin-bottom:12px;">Articles (<span id="menu-count">0</span>)</h2>'+
      '<div class="scroll-list" id="menu-list"><div style="padding:20px;text-align:center;color:#9ca3af;">Chargement...</div></div>'+
    '</div>'+
  '</div>';
  post({action:"load_menu"}, function(err,data){
    if (err||!data) { toast("Erreur chargement menu",true); return; }
    menuItems = data.items||[];
    rebuildMenuList();
  });
}

function rebuildMenuList() {
  el("menu-count").textContent = menuItems.length;
  if (menuItems.length===0) { setHTML("menu-list","<div style='padding:20px;text-align:center;color:#9ca3af;'>Aucun article.</div>"); return; }
  var html = "";
  for (var i=0;i<menuItems.length;i++) {
    var m=menuItems[i];
    var dot = m.available!==false ? '<span class="dot-green"></span>' : '<span class="dot-gray"></span>';
    var img = m.image_url ? '<img src="'+esc(m.image_url)+'" onerror="this.style.display=\'none\'">' : '<div style="width:44px;height:44px;background:#f3f4f6;border-radius:6px;flex-shrink:0;"></div>';
    html += '<div class="menu-item-row">'+img+
      '<div class="menu-item-info">'+dot+'<span class="menu-item-name">'+esc(m.name)+'</span>'+
      '<div class="menu-item-sub">'+esc(m.category)+' — CHF '+(m.price||0).toFixed(2)+'</div></div>'+
      '<div style="display:flex;gap:4px;flex-shrink:0;">'+
        '<button class="btn btn-gray btn-sm" onclick="toggleMenuItem(\''+m.id+'\')">'+(m.available!==false?"Désact.":"Activer")+'</button>'+
        '<button class="btn btn-blue btn-sm" onclick="editMenuItem(\''+m.id+'\')">Éditer</button>'+
        '<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="deleteMenuItem(\''+m.id+'\')">Supp.</button>'+
      '</div></div>';
  }
  setHTML("menu-list", html);
}

function editMenuItem(id) {
  var m=null; for(var i=0;i<menuItems.length;i++){ if(menuItems[i].id===id){m=menuItems[i];break;} }
  if (!m) return;
  menuEditId = id;
  el("mf-name").value = m.name||"";
  el("mf-price").value = m.price||"";
  el("mf-cat").value = m.category||CATEGORIES[0];
  el("mf-desc").value = m.description||"";
  el("mf-allergens").value = m.allergens||"";
  el("mf-img").value = m.image_url||"";
  el("menu-form-title").textContent = "Modifier l'article";
  el("menu-cancel-btn").style.display = "inline-block";
  var saveBtn = el("menu-cancel-btn").previousElementSibling;
  if (saveBtn) saveBtn.textContent = "Modifier";
}

function cancelMenuEdit() {
  menuEditId = null;
  el("mf-name").value=""; el("mf-price").value=""; el("mf-desc").value="";
  el("mf-allergens").value=""; el("mf-img").value="";
  el("menu-form-title").textContent="Ajouter un article";
  el("menu-cancel-btn").style.display="none";
  var saveBtn = el("menu-cancel-btn").previousElementSibling;
  if (saveBtn) saveBtn.textContent="Ajouter";
}

function saveMenuItem() {
  var name = el("mf-name").value.trim();
  var price = parseFloat(el("mf-price").value);
  if (!name || isNaN(price)) { toast("Nom et prix requis",true); return; }
  var data = {
    name: name, price: price, category: el("mf-cat").value,
    description: el("mf-desc").value.trim(),
    allergens: el("mf-allergens").value.trim(),
    image_url: el("mf-img").value.trim(),
    available: true
  };
  post({action:"save_menu_item", item_id: menuEditId||null, data:data}, function(err,resp){
    if (err||!resp||!resp.ok) { toast("Erreur sauvegarde",true); return; }
    toast(menuEditId ? "Article modifié ✓" : "Article ajouté ✓");
    cancelMenuEdit();
    post({action:"load_menu"}, function(e,d){ if(d) { menuItems=d.items||[]; rebuildMenuList(); } });
  });
}

function deleteMenuItem(id) {
  if (!confirm("Supprimer cet article ?")) return;
  post({action:"delete_menu_item",item_id:id}, function(err,resp){
    if (err) { toast("Erreur",true); return; }
    menuItems = menuItems.filter(function(m){return m.id!==id;});
    rebuildMenuList();
    toast("Article supprimé ✓");
  });
}

function toggleMenuItem(id) {
  post({action:"toggle_menu_item",item_id:id}, function(err,resp){
    if (err) { toast("Erreur",true); return; }
    post({action:"load_menu"}, function(e,d){ if(d){ menuItems=d.items||[]; rebuildMenuList(); } });
  });
}

/* ══════════════ RESERVATIONS ══════════════ */
var reservationsData = [];

function renderReservations() {
  el("content").innerHTML = '<div id="res-success" class="success-bar"></div><div id="res-list"><div style="padding:40px;text-align:center;color:#9ca3af;">Chargement...</div></div>';
  post({action:"load_reservations"}, function(err,data){
    if (err||!data) { toast("Erreur",true); return; }
    reservationsData = data.reservations||[];
    rebuildResList();
  });
}

function rebuildResList() {
  var STATUS_LABELS={pending:"En attente",confirmed:"Confirmée",cancelled:"Annulée"};
  var STATUS_B={pending:"b-pending",confirmed:"b-confirmed",cancelled:"b-cancelled"};
  if (reservationsData.length===0) { setHTML("res-list","<div style='padding:40px;text-align:center;color:#9ca3af;'>Aucune réservation.</div>"); return; }
  var html = "";
  for (var i=0;i<reservationsData.length;i++) {
    var r=reservationsData[i];
    var acts = "";
    if (r.status==="pending") {
      acts = '<button class="btn btn-green btn-sm" onclick="updateRes(\''+r.id+'\',\'confirmed\')">Confirmer</button> '+
             '<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="updateRes(\''+r.id+'\',\'cancelled\')">Annuler</button>';
    }
    html += '<div class="res-card">'+
      '<div>'+
        '<div class="res-name">'+esc(r.name)+'</div>'+
        '<div class="res-info">'+esc(r.date)+' à '+esc(r.time)+' — '+r.guests+' personne'+(r.guests>1?"s":"")+'</div>'+
        '<div class="res-info">'+esc(r.email)+' · '+esc(r.phone)+'</div>'+
        (r.notes?'<div style="font-size:12px;color:#9ca3af;font-style:italic;">'+esc(r.notes)+'</div>':'')+
        '<div style="font-size:11px;color:#9ca3af;">Reçu le '+fmtDate(r.created_date)+' à '+fmtTime(r.created_date)+'</div>'+
      '</div>'+
      '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">'+
        '<span class="badge '+STATUS_B[r.status]+'">'+STATUS_LABELS[r.status]+'</span>'+acts+
      '</div>'+
    '</div>';
  }
  setHTML("res-list", html);
}

function updateRes(id, status) {
  post({action:"update_reservation",reservation_id:id,status:status}, function(err,resp){
    if (err) { toast("Erreur",true); return; }
    for(var i=0;i<reservationsData.length;i++){ if(reservationsData[i].id===id){reservationsData[i].status=status;break;} }
    rebuildResList();
    toast(status==="confirmed"?"Réservation confirmée ✓":"Réservation annulée ✓");
  });
}

/* ══════════════ CUSTOMERS ══════════════ */
var customersData = [];
var custSearch = "";

function renderCustomers() {
  el("content").innerHTML =
    '<div class="search-row">'+
      '<input id="cust-search" placeholder="Rechercher par nom, téléphone ou email..." oninput="onCustSearch(this.value)">'+
    '</div>'+
    '<div id="cust-list"><div style="padding:40px;text-align:center;color:#9ca3af;">Chargement...</div></div>';
  post({action:"load_customers"}, function(err,data){
    if (err||!data) { toast("Erreur",true); return; }
    customersData = data.customers||[];
    rebuildCustList();
  });
}

function onCustSearch(v) {
  custSearch = v.toLowerCase();
  rebuildCustList();
}

function rebuildCustList() {
  var filtered = customersData.filter(function(c){
    return (!custSearch)||c.name?.toLowerCase().includes(custSearch)||c.phone?.includes(custSearch)||c.email?.toLowerCase().includes(custSearch);
  });
  if (filtered.length===0) { setHTML("cust-list","<div style='padding:40px;text-align:center;color:#9ca3af;'>Aucun client.</div>"); return; }
  var html = "";
  for (var i=0;i<filtered.length;i++) {
    var c=filtered[i];
    html += '<div class="res-card">'+
      '<div>'+
        '<span style="font-weight:600;font-size:15px;">'+esc(c.name)+'</span>'+
        ' <span style="color:#6b7280;font-size:13px;">'+esc(c.phone)+'</span>'+
        (c.email?'<span style="color:#9ca3af;font-size:13px;margin-left:8px;">'+esc(c.email)+'</span>':'')+
        (c.address?'<div style="font-size:12px;color:#9ca3af;margin-top:2px;">'+esc(c.address)+'</div>':'')+
        (c.notes?'<div style="font-size:12px;color:#9ca3af;font-style:italic;margin-top:2px;">'+esc(c.notes)+'</div>':'')+
      '</div>'+
      '<span style="color:#b5122a;font-weight:700;font-size:14px;">'+(c.total_orders||0)+' commande'+(c.total_orders!==1?"s":"")+'</span>'+
    '</div>';
  }
  setHTML("cust-list", html);
}

/* ══════════════ ANALYTICS ══════════════ */
function renderAnalytics() {
  el("content").innerHTML = '<div class="stats-row">'+
    '<div class="stat-card"><div class="stat-num" id="st-today">--</div><div class="stat-lbl">Commandes aujourd\'hui</div></div>'+
    '<div class="stat-card"><div class="stat-num" id="st-total">--</div><div class="stat-lbl">Commandes total</div></div>'+
    '<div class="stat-card"><div class="stat-num" id="st-res">--</div><div class="stat-lbl">Réservations</div></div>'+
    '<div class="stat-card"><div class="stat-num" id="st-cust">--</div><div class="stat-lbl">Clients</div></div>'+
  '</div>';
  post({action:"load_stats"}, function(err,data){
    if (err||!data) { toast("Erreur statistiques",true); return; }
    setHTML("st-today", data.todayOrders||0);
    setHTML("st-total", data.totalOrders||0);
    setHTML("st-res", data.totalReservations||0);
    setHTML("st-cust", data.totalCustomers||0);
  });
}

/* ══════════════ SETTINGS ══════════════ */
var settingsData = null;

function renderSettings() {
  el("content").innerHTML = '<div style="max-width:540px;"><div class="card" id="settings-card"><div style="padding:40px;text-align:center;color:#9ca3af;">Chargement...</div></div></div>';
  post({action:"load_devices"}, function(err,ddata){
    var devices = (ddata&&ddata.devices)||[];
    post({action:"load_settings"}, function(err2,sdata){
      settingsData = (sdata&&sdata.settings) || {auto_print:true,paper_width:"58mm",copies:1,default_prep_time:30,require_prep_time:true};
      buildSettingsUI(devices);
    });
  });
}

function buildSettingsUI(devices) {
  var s = settingsData;
  var pending = devices.filter(function(d){return d.status==="awaiting_confirmation";});
  var active = devices.filter(function(d){return d.status==="active";});

  var pendingHTML = "";
  for (var i=0;i<pending.length;i++) {
    var d=pending[i];
    pendingHTML += '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">'+
      '<span style="font-weight:500;">'+esc(d.name)+'</span>'+
      '<div><button class="btn btn-green btn-sm" onclick="confirmDevice(\''+d.device_id+'\')">Confirmer</button> '+
      '<button class="btn btn-sm" style="background:#fee2e2;color:#dc2626;" onclick="rejectDevice(\''+d.device_id+'\')">Rejeter</button></div>'+
    '</div>';
  }
  var activeHTML = "";
  for (var i=0;i<active.length;i++) {
    var d=active[i];
    activeHTML += '<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;display:flex;justify-content:space-between;"><span>'+esc(d.name)+'</span><span style="font-size:12px;color:#22c55e;">● Actif</span></div>';
  }

  el("settings-card").innerHTML =
    '<h2 style="font-size:16px;font-weight:600;margin-bottom:16px;">&#128242; Périphériques</h2>'+
    '<div id="prov-success" class="success-bar"></div>'+
    (pending.length>0?'<h4 style="font-size:13px;color:#92400e;margin-bottom:8px;">En attente de confirmation</h4>'+pendingHTML:'<p style="font-size:13px;color:#9ca3af;margin-bottom:8px;">Aucun périphérique en attente.</p>')+
    '<button class="btn btn-red" onclick="generateProvision()" style="margin-bottom:16px;">+ Associer un périphérique</button>'+
    '<div id="qr-area"></div>'+
    (activeHTML?'<h4 style="font-size:13px;margin-top:12px;margin-bottom:8px;">Périphériques actifs</h4>'+activeHTML:'')+
    '<hr style="margin:20px 0;border:none;border-top:1px solid #e5e7eb;">'+
    '<h2 style="font-size:16px;font-weight:600;margin-bottom:16px;">&#128424; Imprimante</h2>'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'+
      '<span>Impression automatique</span>'+
      '<button class="toggle'+(s.auto_print?" on":"'")+'" id="tog-auto" onclick="togSetting(\'auto_print\')"></button>'+
    '</div>'+
    '<div style="margin-bottom:14px;"><div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Largeur du papier</div>'+
    '<div style="display:flex;gap:8px;">'+
      ['58mm','80mm'].map(function(w){return '<button class="btn '+(s.paper_width===w?"btn-red":"btn-gray")+'" onclick="setPaperWidth(\''+w+'\')" id="pw-'+w+'">'+w+'</button>';}).join("")+
    '</div></div>'+
    '<div style="margin-bottom:14px;"><div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Copies</div>'+
    '<div style="display:flex;gap:8px;">'+
      [1,2,3].map(function(n){return '<button class="btn '+(s.copies===n?"btn-red":"btn-gray")+'" onclick="setCopies('+n+')" id="cp-'+n+'">'+n+'</button>';}).join("")+
    '</div></div>'+
    '<div style="margin-bottom:20px;"><div style="font-size:12px;color:#6b7280;margin-bottom:8px;">Temps de préparation par défaut</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;">'+
      [15,30,45,60].map(function(t){return '<button class="btn '+(s.default_prep_time===t?"btn-red":"btn-gray")+'" onclick="setDefPrep('+t+')" id="dp-'+t+'">'+t+' min</button>';}).join("")+
    '</div></div>'+
    '<button class="btn btn-red" style="width:100%;padding:12px;" onclick="saveSettings()">Sauvegarder les paramètres</button>';
}

function togSetting(key) {
  settingsData[key] = !settingsData[key];
  var btn = el("tog-auto");
  if (btn) { btn.className = "toggle"+(settingsData.auto_print?" on":""); }
}
function setPaperWidth(w) {
  settingsData.paper_width = w;
  ["58mm","80mm"].forEach(function(v){ var b=el("pw-"+v); if(b) b.className="btn "+(v===w?"btn-red":"btn-gray"); });
}
function setCopies(n) {
  settingsData.copies = n;
  [1,2,3].forEach(function(v){ var b=el("cp-"+v); if(b) b.className="btn "+(v===n?"btn-red":"btn-gray"); });
}
function setDefPrep(t) {
  settingsData.default_prep_time = t;
  [15,30,45,60].forEach(function(v){ var b=el("dp-"+v); if(b) b.className="btn "+(v===t?"btn-red":"btn-gray"); });
}
function saveSettings() {
  post({action:"save_settings",settings:settingsData}, function(err,resp){
    if (err||!resp||!resp.ok) { toast("Erreur sauvegarde",true); return; }
    toast("Paramètres sauvegardés ✓");
  });
}

function generateProvision() {
  post({action:"generate_provision",device_name:"Sunmi"}, function(err,data){
    if (err||!data||!data.provision_code) { toast("Erreur génération",true); return; }
    var code = data.provision_code;
    var pairUrl = window.location.origin+"/functions/devicePairPage?code="+code;
    setHTML("qr-area",
      '<div class="qr-box">'+
        '<div style="margin-bottom:10px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data='+encodeURIComponent(pairUrl)+'" style="width:180px;height:180px;"></div>'+
        '<div class="qr-code">'+esc(code)+'</div>'+
        '<div style="font-size:12px;color:#9ca3af;margin-top:8px;">Valide 10 minutes</div>'+
      '</div>'
    );
  });
}

function confirmDevice(device_id) {
  post({action:"confirm_device",device_id:device_id}, function(err,resp){
    if (err) { toast("Erreur",true); return; }
    toast("Périphérique confirmé ✓");
    renderSettings();
  });
}
function rejectDevice(device_id) {
  post({action:"reject_device",device_id:device_id}, function(err,resp){
    if (err) { toast("Erreur",true); return; }
    toast("Périphérique rejeté");
    renderSettings();
  });
}

/* ══════════════ INIT ══════════════ */
if (checkAuth()) {
  switchTab("orders");
  setInterval(function(){ if(currentTab==="orders") post({action:"load_orders"}, function(err,d){ if(d&&d.orders){ ordersData=d.orders; rebuildOrderFilters(); rebuildOrderList(); } }); }, 15000);
}
</script>
</body>
</html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
});