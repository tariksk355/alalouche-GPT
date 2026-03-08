Deno.serve(async (_req) => {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,user-scalable=no">
<title>Commandes</title>
<style>
* { -webkit-box-sizing:border-box; box-sizing:border-box; }
body{margin:0;padding:0;font-family:Arial,sans-serif;background:#111827;color:#fff;}
#debug{position:fixed;bottom:0;left:0;right:0;background:#000;color:#0f0;font-size:10px;font-family:monospace;padding:4px 8px;max-height:120px;overflow-y:auto;z-index:9999;display:none;}
header{background:#1f2937;padding:12px 16px;display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;-webkit-justify-content:space-between;justify-content:space-between;border-bottom:1px solid #374151;}
.hdot{width:8px;height:8px;background:#22c55e;border-radius:50%;display:inline-block;margin-right:8px;}
.hbadge{background:#eab308;color:#000;font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:8px;}
#content{padding:12px;}
.card{border-radius:10px;border:2px solid #374151;padding:14px;margin-bottom:10px;}
.card.new{border-color:#eab308;background:rgba(234,179,8,0.08);}
.card.accepted{border-color:#3b82f6;background:rgba(59,130,246,0.08);}
.card.ready{border-color:#22c55e;background:rgba(34,197,94,0.08);}
.row{display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;-webkit-align-items:flex-start;align-items:flex-start;margin-bottom:10px;}
.onum{font-size:16px;font-weight:700;}
.sbadge{font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px;}
.s-new{background:#eab308;color:#000;}
.s-accepted,.s-ready{background:#374151;color:#fff;}
.cname{font-weight:500;margin-top:2px;}
.cphone{color:#9ca3af;font-size:13px;}
.amt{font-size:16px;font-weight:700;text-align:right;}
.lbl{color:#9ca3af;font-size:12px;text-align:right;}
.ibox{background:rgba(0,0,0,0.3);border-radius:8px;padding:10px;margin-bottom:10px;font-size:13px;}
.irow{display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;margin-bottom:4px;}
.note{color:#fbbf24;font-size:12px;margin-top:6px;}
.addr{color:#93c5fd;font-size:12px;margin-top:4px;}
.prepbox{background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);border-radius:8px;padding:10px;margin-bottom:10px;}
.preplbl{color:#fde047;font-size:13px;font-weight:700;margin-bottom:8px;}
.prepbtns{display:-webkit-flex;display:flex;gap:6px;}
.pbtn{-webkit-flex:1;flex:1;padding:14px 0;background:#eab308;color:#000;font-weight:700;font-size:15px;border:none;border-radius:8px;cursor:pointer;}
.readybox{background:rgba(59,130,246,0.12);border:1px solid rgba(59,130,246,0.3);border-radius:8px;padding:10px;margin-bottom:10px;text-align:center;color:#93c5fd;font-weight:700;}
.acts{display:-webkit-flex;display:flex;gap:8px;margin-top:4px;}
.btn{padding:10px 14px;border:none;border-radius:8px;font-weight:500;cursor:pointer;font-size:14px;color:#fff;}
.btn-green{-webkit-flex:1;flex:1;background:#16a34a;}
.btn-gray2{-webkit-flex:1;flex:1;background:#374151;}
.btn-print{background:#374151;}
.empty{text-align:center;padding:60px 20px;color:#6b7280;}
.alertbar{position:fixed;top:0;left:0;right:0;background:#eab308;color:#000;padding:12px 16px;display:none;z-index:50;}
/* Auth screen — token/pairing failures only */
#authscreen{position:fixed;top:0;left:0;right:0;bottom:0;background:#111827;display:-webkit-flex;display:flex;-webkit-align-items:flex-start;align-items:flex-start;-webkit-justify-content:center;justify-content:center;padding:16px;z-index:100;overflow-y:auto;}
/* Server error screen — backend/data failures */
#errscreen{position:fixed;top:0;left:0;right:0;bottom:0;background:#111827;display:none;-webkit-align-items:flex-start;align-items:flex-start;-webkit-justify-content:center;justify-content:center;padding:16px;z-index:100;overflow-y:auto;}
.acard{background:#1f2937;border-radius:14px;max-width:420px;width:100%;padding:24px;text-align:center;margin-top:16px;}
.acard h2{font-size:17px;margin-bottom:6px;}
.acard p{color:#9ca3af;font-size:13px;margin-bottom:6px;}
.abtn{display:block;padding:12px;background:#b5122a;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none;width:100%;text-align:center;margin-top:12px;}
.abtn-sec{background:#374151;margin-top:8px;}
.abtn-orange{background:#d97706;margin-top:8px;}
/* Main debug log — small at bottom */
.diag-log{background:#0a0a0a;border:1px solid #374151;border-radius:8px;padding:8px;margin-top:10px;text-align:left;font-size:10px;font-family:monospace;color:#6b7280;max-height:120px;overflow-y:auto;word-break:break-all;}
/* Verify result box — large and unmissable */
.verify-result-box{background:#0a0a0a;border:2px solid #ef4444;border-radius:10px;padding:14px;margin-top:14px;text-align:left;font-size:12px;font-family:monospace;color:#fca5a5;word-break:break-all;white-space:pre-wrap;max-height:280px;overflow-y:auto;}
.verify-result-label{color:#ef4444;font-weight:700;font-size:13px;margin-bottom:6px;}
</style>
</head>
<body>

<div id="alertbar" class="alertbar">
  <div style="display:-webkit-flex;display:flex;-webkit-justify-content:space-between;justify-content:space-between;-webkit-align-items:center;align-items:center;">
    <div><b style="font-size:15px;">NOUVELLE COMMANDE!</b><div id="alertdetail" style="font-size:12px;"></div></div>
    <div id="alertamt" style="font-weight:700;font-size:15px;"></div>
  </div>
</div>

<!-- AUTH SCREEN: only for token/pairing failures -->
<div id="authscreen">
  <div class="acard">
    <div style="font-size:36px;margin-bottom:12px;">&#128274;</div>
    <h2>Acces requis</h2>
    <p id="auth-reason">Verification en cours...</p>
    <!-- Verify result — large unmissable box, shown only on failure -->
    <div id="verify-result-wrap" style="display:none;">
      <div class="verify-result-label">&#9888; Resultat verify (JSON complet):</div>
      <div id="verify-result-box" class="verify-result-box"></div>
    </div>
    <div id="auth-diag" class="diag-log" style="display:none;"></div>
    <a href="/functions/devicePairPage" class="abtn">Associer ce peripherique</a>
    <button onclick="retryAuth()" class="abtn abtn-sec">Reessayer</button>
  </div>
</div>

<!-- SERVER ERROR SCREEN: for health/load_orders/backend failures -->
<div id="errscreen">
  <div class="acard">
    <div style="font-size:36px;margin-bottom:12px;">&#9888;&#65039;</div>
    <h2>Erreur serveur</h2>
    <p id="err-reason">Une erreur s'est produite.</p>
    <div id="err-diag" class="verify-result-box" style="border-color:#d97706;color:#fde68a;"></div>
    <button onclick="retryServer()" class="abtn abtn-orange">Reessayer</button>
    <button onclick="retryAuth()" class="abtn abtn-sec">Changer de token</button>
  </div>
</div>

<div id="mainapp" style="display:none;">
  <header>
    <div><span class="hdot"></span><b>Reception commandes</b><span id="pendingbadge" class="hbadge" style="display:none;"></span></div>
    <span id="livestatus" style="color:#6b7280;font-size:12px;">chargement...</span>
  </header>
  <div id="content"><div class="empty">Chargement...</div></div>
</div>

<div id="debug"></div>

<script>
var ORDER_API = "/functions/orderReceiverPage";
var VERIFY_API = "/functions/deviceProvision";
var TOKEN = "";
var cache = [];
var knownIds = {};
var printedIds = {};
var pollTimer = null;

function dbg(msg) {
  var el = document.getElementById("debug");
  if (el) { el.style.display = "block"; el.innerHTML = el.innerHTML + "<div>" + msg + "</div>"; el.scrollTop = el.scrollHeight; }
  var diag = document.getElementById("auth-diag");
  if (diag) { diag.style.display = "block"; diag.innerHTML = diag.innerHTML + "<div>" + msg + "</div>"; diag.scrollTop = diag.scrollHeight; }
  try { console.log("[recv] " + msg); } catch(e) {}
}

function showVerifyResult(json, isHttp500, rawBody) {
  var wrap = document.getElementById("verify-result-wrap");
  var box = document.getElementById("verify-result-box");
  if (!wrap || !box) return;
  wrap.style.display = "block";
  var content = "";
  if (isHttp500) {
    content = "=== VERIFY HTTP 500 ===\n" + (rawBody || "(no body)");
  } else if (json !== null && json !== undefined) {
    content = JSON.stringify(json, null, 2);
  } else {
    content = "(null / empty response)";
  }
  box.textContent = content;
}

// Show auth screen (token/pairing failures ONLY)
function showAuth(reason, verifyJson, isHttp500, rawBody) {
  var el = document.getElementById("auth-reason");
  if (el) el.textContent = reason || "Token invalide ou expire.";
  document.getElementById("authscreen").style.display = "-webkit-flex";
  document.getElementById("authscreen").style.display = "flex";
  document.getElementById("errscreen").style.display = "none";
  document.getElementById("mainapp").style.display = "none";
  if (verifyJson !== undefined || isHttp500) {
    showVerifyResult(verifyJson, isHttp500, rawBody);
  }
  dbg("AUTH SCREEN: " + reason);
}

// Show server error screen (health/data/backend failures)
function showServerError(reason, detail) {
  var el = document.getElementById("err-reason");
  if (el) el.textContent = reason || "Erreur serveur inattendue.";
  var ediag = document.getElementById("err-diag");
  if (ediag) {
    ediag.textContent = detail ? (typeof detail === "object" ? JSON.stringify(detail, null, 2) : String(detail)) : "";
  }
  document.getElementById("errscreen").style.display = "-webkit-flex";
  document.getElementById("errscreen").style.display = "flex";
  document.getElementById("authscreen").style.display = "none";
  document.getElementById("mainapp").style.display = "none";
  dbg("SERVER ERROR: " + reason + " | " + JSON.stringify(detail));
}

function showMain() {
  document.getElementById("authscreen").style.display = "none";
  document.getElementById("errscreen").style.display = "none";
  document.getElementById("mainapp").style.display = "block";
}

function retryAuth() {
  dbg("--- RETRY AUTH ---");
  TOKEN = "";
  clearStaleToken();
  document.getElementById("errscreen").style.display = "none";
  document.getElementById("auth-diag").innerHTML = "";
  document.getElementById("verify-result-wrap").style.display = "none";
  document.getElementById("verify-result-box").textContent = "";
  document.getElementById("authscreen").style.display = "-webkit-flex";
  document.getElementById("authscreen").style.display = "flex";
  document.getElementById("auth-reason").textContent = "Verification en cours...";
  init();
}

function retryServer() {
  dbg("--- RETRY SERVER ---");
  document.getElementById("errscreen").style.display = "none";
  if (TOKEN) {
    startApp();
  } else {
    init();
  }
}

function clearStaleToken() {
  try { localStorage.removeItem("device_access_token"); dbg("stale token cleared from localStorage"); } catch(e) { dbg("localStorage clear err: " + e.message); }
  try { sessionStorage.removeItem("device_access_token"); dbg("stale token cleared from sessionStorage"); } catch(e) { dbg("sessionStorage clear err: " + e.message); }
}

function lsGet(key) {
  try {
    var v = localStorage.getItem(key);
    if (v) { dbg("token source: localStorage (len=" + v.length + " prefix=" + v.substring(0,12) + ")"); return v; }
  } catch(e) { dbg("localStorage unavailable: " + e.message); }
  try {
    var v2 = sessionStorage.getItem(key);
    if (v2) { dbg("token source: sessionStorage (len=" + v2.length + " prefix=" + v2.substring(0,12) + ")"); return v2; }
  } catch(e2) { dbg("sessionStorage unavailable: " + e2.message); }
  dbg("token source: nowhere (not found in localStorage or sessionStorage)");
  return null;
}

function lsSet(key, val) {
  var lsOk = false, ssOk = false;
  try { localStorage.setItem(key, val); lsOk = localStorage.getItem(key) === val; } catch(e) { dbg("lsSet localStorage err: " + e.message); }
  try { sessionStorage.setItem(key, val); ssOk = sessionStorage.getItem(key) === val; } catch(e2) { dbg("lsSet sessionStorage err: " + e2.message); }
  dbg("token persist: localStorage=" + (lsOk?"OK":"FAIL") + " sessionStorage=" + (ssOk?"OK":"FAIL"));
  return lsOk || ssOk;
}

function extractTokenFromUrl() {
  try {
    var search = window.location.search || "";
    dbg("URL search string: '" + search + "'");
    if (!search || search.length < 2) { dbg("URL search: empty, no token in URL"); return null; }
    var pairs = search.substring(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf("=");
      if (eq < 0) continue;
      var k = pairs[i].substring(0, eq);
      var v = pairs[i].substring(eq + 1);
      if (k === "token" && v) {
        var decoded = decodeURIComponent(v.replace(/\+/g, " "));
        dbg("URL token found: len=" + decoded.length + " prefix=" + decoded.substring(0,12));
        return decoded;
      }
    }
    dbg("URL search present but no 'token' param found");
    return null;
  } catch(e) {
    dbg("URL parse error: " + e.message);
    return null;
  }
}

function postTo(url, payload, cb) {
  var xhr = new XMLHttpRequest();
  xhr.open("POST", url, true);
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onreadystatechange = function() {
    if (xhr.readyState === 4) {
      var shortBody = xhr.responseText.substring(0, 300);
      dbg("POST " + url.split("/").pop() + " HTTP=" + xhr.status + " body=" + shortBody);
      if (xhr.status >= 500) {
        cb(new Error("HTTP_" + xhr.status), null, true, xhr.responseText.substring(0, 800));
        return;
      }
      try { cb(null, JSON.parse(xhr.responseText), false, null); }
      catch(e) { cb(e, null, false, null); }
    }
  };
  xhr.onerror = function() { cb(new Error("network error"), null, false, null); };
  xhr.send(JSON.stringify(payload));
}

function post(payload, cb) { postTo(ORDER_API, payload, function(err, data) { cb(err, data); }); }

function esc(s) {
  if (!s) return "";
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function fmtTime(iso) {
  if (!iso) return "--";
  var d = new Date(iso);
  var h = d.getHours(), m = d.getMinutes();
  return (h<10?"0"+h:h)+":"+(m<10?"0"+m:m);
}

function fmtAmt(n) { return "CHF " + (parseFloat(n)||0).toFixed(2); }

function render(orders) {
  var active = [];
  for (var i=0;i<orders.length;i++) {
    if (orders[i].status !== "completed" && orders[i].status !== "cancelled") active.push(orders[i]);
  }
  var pending = 0;
  for (var i=0;i<orders.length;i++) { if (orders[i].status==="new") pending++; }
  var pb = document.getElementById("pendingbadge");
  if (pending > 0) { pb.style.display=""; pb.textContent = pending + " nouveau" + (pending>1?"x":""); }
  else { pb.style.display="none"; }

  if (active.length === 0) {
    document.getElementById("content").innerHTML = '<div class="empty"><div style="font-size:40px;margin-bottom:10px;">&#10003;</div><p>Aucune commande en attente</p></div>';
    return;
  }

  var html = "";
  for (var i=0;i<active.length;i++) {
    var o = active[i];
    var sclass = o.status === "new" ? "s-new" : (o.status === "accepted" ? "s-accepted" : "s-ready");
    var slbl = o.status === "new" ? "NOUVEAU" : (o.status === "accepted" ? "Accepte" : "Pret");
    var items = "";
    if (o.items) {
      for (var j=0;j<o.items.length;j++) {
        var it = o.items[j];
        items += '<div class="irow"><span>'+esc(it.name)+' <span style="color:#9ca3af;">x'+it.quantity+'</span></span><span>'+fmtAmt(it.price*it.quantity)+'</span></div>';
      }
    }
    if (o.notes) items += '<div class="note">&#128221; '+esc(o.notes)+'</div>';
    if (o.customer_address) items += '<div class="addr">&#128205; '+esc(o.customer_address)+'</div>';

    var prep = "";
    if (o.status === "new") {
      prep = '<div class="prepbox"><div class="preplbl">Choisir le temps de preparation:</div><div class="prepbtns">'+
        '<button class="pbtn" onclick="setPrep(\''+o.id+'\',15)">15m</button>'+
        '<button class="pbtn" onclick="setPrep(\''+o.id+'\',30)">30m</button>'+
        '<button class="pbtn" onclick="setPrep(\''+o.id+'\',45)">45m</button>'+
        '<button class="pbtn" onclick="setPrep(\''+o.id+'\',60)">60m</button>'+
        '</div></div>';
    }

    var readybox = "";
    if (o.status === "accepted" && o.ready_at) {
      readybox = '<div class="readybox">Pret a: '+fmtTime(o.ready_at)+' ('+o.prep_time_minutes+' min)</div>';
    }

    var acts = '<div class="acts">';
    if (o.status === "accepted") acts += '<button class="btn btn-green" onclick="updStatus(\''+o.id+'\',\'ready\')">&#10003; Pret</button>';
    if (o.status === "ready") acts += '<button class="btn btn-gray2" onclick="updStatus(\''+o.id+'\',\'completed\')">&#10003; Termine</button>';
    acts += '<button class="btn btn-print" onclick="doPrint(\''+o.id+'\')">&#128424; '+(o.printed?"Re-impr.":"Imprimer")+'</button></div>';

    html += '<div class="card '+o.status+'">'+
      '<div class="row">'+
        '<div><div style="display:-webkit-flex;display:flex;-webkit-align-items:center;align-items:center;"><span class="onum">'+esc(o.order_number)+'</span><span class="sbadge '+sclass+'">'+slbl+'</span></div>'+
        '<div class="cname">'+esc(o.customer_name)+'</div><div class="cphone">'+esc(o.customer_phone)+'</div></div>'+
        '<div><div class="amt">'+fmtAmt(o.total_amount)+'</div>'+
        '<div class="lbl">'+(o.order_type==="takeaway"?"Emporter":"Livraison")+'</div>'+
        '<div class="lbl">'+(o.payment_method==="cash"?"Especes":"Carte")+'</div></div>'+
      '</div>'+
      '<div class="ibox">'+items+'</div>'+
      prep+readybox+acts+
    '</div>';
  }
  document.getElementById("content").innerHTML = html;
  cache = orders;
}

function updCache(updated) {
  for (var i=0;i<cache.length;i++) {
    if (cache[i].id === updated.id) { cache[i] = updated; return; }
  }
}

function updStatus(id, st) {
  post({action:"update_order",order_id:id,status:st}, function(err,data) {
    if (err) { dbg("updStatus err: " + err.message); return; }
    if (data && data.ok === false) { dbg("updStatus server err: " + data.error); return; }
    if (data && data.order) { updCache(data.order); render(cache); }
  });
}

function setPrep(id, mins) {
  post({action:"update_order",order_id:id,prep_minutes:mins}, function(err,data) {
    if (err) { dbg("setPrep err: " + err.message); return; }
    if (data && data.ok === false) { dbg("setPrep server err: " + data.error); return; }
    if (data && data.order) {
      updCache(data.order);
      render(cache);
      printReceipt(data.order);
      post({action:"mark_printed",order_id:id}, function(){});
    }
  });
}

function doPrint(id) {
  for (var i=0;i<cache.length;i++) {
    if (cache[i].id===id) {
      printReceipt(cache[i]);
      post({action:"mark_printed",order_id:id}, function(){});
      return;
    }
  }
}

function printReceipt(o) {
  var items = "";
  if (o.items) {
    for (var i=0;i<o.items.length;i++) {
      var it=o.items[i];
      items += it.name+" x"+it.quantity+"  CHF "+(it.price*it.quantity).toFixed(2)+"\n";
    }
  }
  var r = "================================\n"+
    "        A LA LOUCHE\n"+
    "   Rte de Chantemerle 58\n"+
    "   026 303 45 61\n"+
    "================================\n"+
    "N: "+(o.order_number||"")+"\n"+
    "Type: "+(o.order_type==="takeaway"?"A EMPORTER":"LIVRAISON")+"\n"+
    "Paiement: "+(o.payment_method==="cash"?"ESPECES":"CARTE")+"\n"+
    "================================\n"+
    "CLIENT: "+(o.customer_name||"")+"\n"+
    "TEL: "+(o.customer_phone||"")+"\n"+
    (o.customer_address?"ADRESSE: "+o.customer_address+"\n":"")+
    "================================\n"+
    "ARTICLES:\n"+items+
    "--------------------------------\n"+
    "TOTAL: CHF "+(o.total_amount||0).toFixed(2)+"\n"+
    (o.prep_time_minutes?"PREP: "+o.prep_time_minutes+" min\nPRET A: "+fmtTime(o.ready_at)+"\n":"")+
    (o.notes?"NOTES: "+o.notes+"\n":"")+
    "================================\n\n\n";

  var existing = document.getElementById("print-frame");
  if (existing) existing.parentNode.removeChild(existing);

  var iframe = document.createElement("iframe");
  iframe.id = "print-frame";
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "58mm";
  iframe.style.height = "200mm";
  document.body.appendChild(iframe);

  var doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write("<!DOCTYPE html><html><head><style>"+
    "@media print { @page { margin: 0; size: 58mm auto; } }"+
    "body{font-family:monospace;font-size:12px;width:58mm;margin:0;padding:4px;}"+
    "pre{white-space:pre-wrap;word-wrap:break-word;margin:0;}"+
    "</style></head><body><pre>"+r+"</pre></body></html>");
  doc.close();

  setTimeout(function() {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
    catch(e) { dbg("print err: "+e.message); }
    setTimeout(function(){ if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 3000);
  }, 300);
}

function showAlert(o) {
  var bar = document.getElementById("alertbar");
  document.getElementById("alertdetail").textContent = (o.order_number||"")+" - "+(o.customer_name||"");
  document.getElementById("alertamt").textContent = fmtAmt(o.total_amount);
  bar.style.display = "block";
  setTimeout(function(){ bar.style.display="none"; }, 6000);
}

function poll() {
  post({action:"poll_orders"}, function(err,data) {
    if (err) { dbg("poll err: " + err.message); return; }
    if (!data || !data.orders) { dbg("poll: no orders in response"); return; }
    var orders = data.orders;
    for (var i=0;i<orders.length;i++) {
      if (orders[i].status==="new" && !knownIds[orders[i].id]) {
        knownIds[orders[i].id] = true;
        showAlert(orders[i]);
      }
    }
    var autoPrint = data.auto_print || [];
    for (var j=0;j<autoPrint.length;j++) {
      var pid = autoPrint[j];
      if (!printedIds[pid]) {
        printedIds[pid] = true;
        for (var k=0;k<orders.length;k++) {
          if (orders[k].id === pid) {
            printReceipt(orders[k]);
            post({action:"mark_printed",order_id:pid}, function(){});
            break;
          }
        }
      }
    }
    cache = orders;
    render(orders);
    document.getElementById("livestatus").textContent = "live \u2713";
  });
}

function checkPrintQueue() {
  post({action:"get_print_queue"}, function(err,data) {
    if (err || !data || !data.queue) return;
    var queue = data.queue;
    for (var i=0;i<queue.length;i++) {
      var o = queue[i];
      if (!printedIds[o.id]) {
        printedIds[o.id] = true;
        printReceipt(o);
        post({action:"mark_printed",order_id:o.id}, function(){});
      }
    }
  });
}

function startApp() {
  post({action:"health"}, function(err, data) {
    dbg("orderReceiverPage health: " + (err ? "ERR " + err.message : JSON.stringify(data)));
    if (err) {
      dbg("VERIFY PASSED, HEALTH FAILED");
      showServerError("health check failed: " + err.message, { network_error: err.message });
      return;
    }
    if (!data || !data.ok) {
      dbg("VERIFY PASSED, HEALTH FAILED");
      showServerError("health check returned not-ok", data);
      return;
    }
    dbg("health OK ts=" + (data.timestamp||"?"));

    post({action:"load_orders"}, function(err2, data2) {
      if (err2) {
        dbg("VERIFY PASSED, LOAD_ORDERS FAILED");
        showServerError("Erreur chargement commandes: " + err2.message, { network_error: err2.message });
        return;
      }
      if (!data2 || data2.ok === false) {
        dbg("VERIFY PASSED, LOAD_ORDERS FAILED");
        showServerError("Erreur serveur lors du chargement", data2);
        return;
      }
      var orders = data2.orders || [];
      dbg("load_orders OK count=" + orders.length);
      for (var i=0;i<orders.length;i++) {
        knownIds[orders[i].id]=true;
        if (orders[i].printed) printedIds[orders[i].id] = true;
      }
      cache = orders;
      render(orders);
      pollTimer = setInterval(poll, 5000);
      setInterval(checkPrintQueue, 4000);
    });
  });
}

function doVerify(token) {
  dbg("=== VERIFY START ===");
  dbg("URL search string: '" + (window.location.search || "") + "'");
  dbg("token to verify: len=" + token.length + " prefix=" + token.substring(0,12));

  // Step 0: deviceProvision health check first
  postTo(VERIFY_API, {action:"health"}, function(herr, hdata, h500, hbody) {
    if (herr) {
      dbg("deviceProvision health ERR: " + herr.message + (h500 ? " RAW=" + hbody : ""));
    } else {
      dbg("deviceProvision health OK: " + JSON.stringify(hdata));
    }

    // Step 1: verify token regardless of health result
    var payload = { action: "verify", access_token: token };
    dbg("calling verify on " + VERIFY_API);

    postTo(VERIFY_API, payload, function(err, data, is500, rawBody) {
      if (is500) {
        dbg("VERIFY HTTP 500 — raw: " + rawBody);
        showAuth("VERIFY HTTP 500 — voir details ci-dessous", null, true, rawBody);
        return;
      }
      if (err) {
        dbg("verify network error: " + err.message);
        showAuth("Erreur reseau lors de la verification: " + err.message, null, false, null);
        return;
      }

      dbg("verify response (full): " + JSON.stringify(data));

      if (!data) {
        dbg("verify: null/empty response");
        showAuth("Reponse vide du serveur.", data, false, null);
        return;
      }

      if (data.valid === true) {
        dbg("VERIFY PASSED, STARTING APP");
        lsSet("device_access_token", token);
        TOKEN = token;
        showMain();
        startApp();
      } else {
        var reason = data.reason || "none";
        dbg("VERIFY FAILED — reason=" + reason + " full=" + JSON.stringify(data));
        if (reason === "not_found" || reason === "not_active") {
          dbg("clearing stale token due to: " + reason);
          clearStaleToken();
        }
        showAuth("Acces refuse — reason: " + reason, data, false, null);
      }
    });
  });
}

function init() {
  dbg("=== INIT ===");
  dbg("UA: " + navigator.userAgent.substring(0, 80));
  dbg("URL: " + window.location.href.substring(0, 80));
  var urlToken = extractTokenFromUrl();
  if (urlToken) { doVerify(urlToken); return; }
  var storedToken = lsGet("device_access_token");
  if (storedToken) { doVerify(storedToken); return; }
  dbg("No token found anywhere — must pair device");
  showAuth("Aucun token trouve. Veuillez associer ce peripherique.");
}

init();
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
});