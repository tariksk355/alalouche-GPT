import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  // GET = redirect to the static HTML page function
  if (req.method !== "POST") {
    return Response.redirect(new URL("/functions/orderReceiverUI", req.url).href, 302);
  }

  // POST = API handler
  let action = "unknown";
  let base44 = null;

  try {
    const body = await req.json().catch(() => ({}));
    action = body.action || "unknown";
    const { order_id, status, prep_minutes } = body;

    console.log("[orderReceiverPage] action=" + action);

    if (action === "health") {
      let canCreateClient = false;
      try {
        base44 = createClientFromRequest(req);
        canCreateClient = true;
        console.log("[orderReceiverPage] health: createClientFromRequest OK");
      } catch(e) {
        console.log("[orderReceiverPage] health: createClientFromRequest FAILED: " + e.message);
      }
      return Response.json({
        ok: true,
        function: "orderReceiverPage",
        timestamp: new Date().toISOString(),
        can_create_client: canCreateClient
      });
    }

    try {
      base44 = createClientFromRequest(req);
      console.log("[orderReceiverPage] createClientFromRequest OK");
    } catch(e) {
      console.log("[orderReceiverPage] createClientFromRequest FAILED: " + e.message);
      return Response.json({ ok: false, action, error: "createClientFromRequest failed: " + e.message, stack: e.stack || "" }, { status: 500 });
    }

    if (action === "load_orders") {
      try {
        const orders = await base44.asServiceRole.entities.Order.list("-created_date", 30);
        console.log("[orderReceiverPage] load_orders count=" + (orders ? orders.length : "null"));
        return Response.json({ orders });
      } catch(e) {
        console.log("[orderReceiverPage] load_orders FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    if (action === "poll_orders") {
      try {
        const orders = await base44.asServiceRole.entities.Order.list("-created_date", 30);
        console.log("[orderReceiverPage] poll_orders count=" + (orders ? orders.length : "null"));
        const toPrint = orders.filter(o => o.status === "accepted" && !o.printed);
        return Response.json({ orders, auto_print: toPrint.map(o => o.id) });
      } catch(e) {
        console.log("[orderReceiverPage] poll_orders FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    if (action === "update_order") {
      try {
        const updates = {};
        if (status) updates.status = status;
        if (prep_minutes) {
          updates.prep_time_minutes = prep_minutes;
          updates.ready_at = new Date(Date.now() + prep_minutes * 60000).toISOString();
          updates.status = "accepted";
        }
        await base44.asServiceRole.entities.Order.update(order_id, updates);
        const list = await base44.asServiceRole.entities.Order.filter({ id: order_id });
        console.log("[orderReceiverPage] update_order OK id=" + order_id);
        return Response.json({ order: list[0] || null });
      } catch(e) {
        console.log("[orderReceiverPage] update_order FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    if (action === "mark_printed") {
      try {
        await base44.asServiceRole.entities.Order.update(order_id, { printed: true, printed_at: new Date().toISOString() });
        console.log("[orderReceiverPage] mark_printed OK id=" + order_id);
        return Response.json({ ok: true });
      } catch(e) {
        console.log("[orderReceiverPage] mark_printed FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    if (action === "get_print_queue") {
      try {
        const orders = await base44.asServiceRole.entities.Order.filter({ status: "accepted", printed: false });
        console.log("[orderReceiverPage] get_print_queue count=" + (orders ? orders.length : "null"));
        return Response.json({ queue: orders });
      } catch(e) {
        console.log("[orderReceiverPage] get_print_queue FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    return Response.json({ error: "unknown action: " + action }, { status: 400 });

  } catch(e) {
    console.log("[orderReceiverPage] TOP-LEVEL CATCH action=" + action + " err=" + e.message);
    return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
  }
});