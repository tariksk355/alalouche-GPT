import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  let action = "unknown";

  try {
    const body = await req.json().catch(() => ({}));
    action = body.action || "unknown";
    const { provision_code, device_name, device_id, access_token } = body;

    console.log("[deviceProvision] action=" + action);

    // ── health — NO SDK needed, return immediately ──
    if (action === "health") {
      return Response.json({ ok: true, function: "deviceProvision", timestamp: new Date().toISOString() });
    }

    // All other actions need DB access — create client here
    const base44 = createClientFromRequest(req);

    // ── generate ──
    if (action === "generate") {
      try {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        let code = "";
        for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        const deviceId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        await base44.asServiceRole.entities.Device.create({
          device_id: deviceId,
          name: device_name || "Sunmi",
          provision_code: code,
          provision_code_expires_at: expiresAt,
          provision_code_used: false,
          status: "pending"
        });
        console.log("[deviceProvision] generate OK code=" + code);
        return Response.json({ device_id: deviceId, provision_code: code, expires_at: expiresAt });
      } catch(e) {
        console.log("[deviceProvision] generate FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    // ── activate ──
    if (action === "activate") {
      try {
        if (!provision_code) return Response.json({ error: "provision_code required" }, { status: 400 });
        const devices = await base44.asServiceRole.entities.Device.filter({ provision_code });
        if (devices.length === 0) return Response.json({ error: "Code invalide" }, { status: 404 });
        const device = devices[0];
        if (device.provision_code_used) return Response.json({ error: "Code deja utilise" }, { status: 400 });
        if (new Date(device.provision_code_expires_at) < new Date()) return Response.json({ error: "Code expire" }, { status: 400 });
        await base44.asServiceRole.entities.Device.update(device.id, {
          status: "awaiting_confirmation",
          last_seen_at: new Date().toISOString()
        });
        console.log("[deviceProvision] activate OK device_id=" + device.device_id);
        return Response.json({ status: "awaiting_confirmation", device_id: device.device_id });
      } catch(e) {
        console.log("[deviceProvision] activate FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    // ── poll_status ──
    if (action === "poll_status") {
      try {
        if (!provision_code) return Response.json({ error: "provision_code required" }, { status: 400 });
        const devices = await base44.asServiceRole.entities.Device.filter({ provision_code });
        if (devices.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
        const device = devices[0];
        if (device.status === "active" && device.access_token) {
          return Response.json({ status: "active", device_id: device.device_id, access_token: device.access_token, token_expires_at: device.token_expires_at });
        }
        return Response.json({ status: device.status });
      } catch(e) {
        console.log("[deviceProvision] poll_status FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    // ── confirm ──
    if (action === "confirm") {
      try {
        if (!device_id) return Response.json({ error: "device_id required" }, { status: 400 });
        const devices = await base44.asServiceRole.entities.Device.filter({ device_id });
        if (devices.length === 0) return Response.json({ error: "Device not found" }, { status: 404 });
        const device = devices[0];
        if (device.status !== "awaiting_confirmation") return Response.json({ error: "Device not awaiting confirmation" }, { status: 400 });
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const newAccessToken = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, "0")).join("");
        const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
        await base44.asServiceRole.entities.Device.update(device.id, {
          provision_code_used: true,
          access_token: newAccessToken,
          token_expires_at: tokenExpiresAt,
          status: "active",
          last_seen_at: new Date().toISOString()
        });
        console.log("[deviceProvision] confirm OK device_id=" + device_id);
        return Response.json({ success: true });
      } catch(e) {
        console.log("[deviceProvision] confirm FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    // ── reject ──
    if (action === "reject") {
      try {
        if (!device_id) return Response.json({ error: "device_id required" }, { status: 400 });
        const devices = await base44.asServiceRole.entities.Device.filter({ device_id });
        if (devices.length > 0) {
          await base44.asServiceRole.entities.Device.update(devices[0].id, { status: "revoked", provision_code_used: true });
        }
        console.log("[deviceProvision] reject OK device_id=" + device_id);
        return Response.json({ success: true });
      } catch(e) {
        console.log("[deviceProvision] reject FAILED: " + e.message);
        return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
      }
    }

    // ── verify ──
    if (action === "verify") {
      const tokenLen = access_token ? access_token.length : 0;
      const tokenPrefix = access_token ? access_token.substring(0, 12) : "";
      try {
        if (!access_token) {
          return Response.json({ valid: false, reason: "no_token", action: "verify", token_received_length: 0, token_received_prefix: "", matched_device_id: null, matched_device_status: null });
        }
        const devices = await base44.asServiceRole.entities.Device.filter({ access_token });
        console.log("[deviceProvision] verify filter returned " + devices.length + " device(s) for prefix=" + tokenPrefix);
        if (devices.length === 0) {
          return Response.json({ valid: false, reason: "not_found", action: "verify", token_received_length: tokenLen, token_received_prefix: tokenPrefix, matched_device_id: null, matched_device_status: null });
        }
        const device = devices[0];
        if (device.status !== "active") {
          return Response.json({ valid: false, reason: "not_active", action: "verify", token_received_length: tokenLen, token_received_prefix: tokenPrefix, matched_device_id: device.device_id, matched_device_status: device.status });
        }
        await base44.asServiceRole.entities.Device.update(device.id, { last_seen_at: new Date().toISOString() });
        console.log("[deviceProvision] verify OK device_id=" + device.device_id);
        return Response.json({ valid: true, action: "verify", device_id: device.device_id, name: device.name, token_received_length: tokenLen, token_received_prefix: tokenPrefix, matched_device_id: device.device_id, matched_device_status: device.status });
      } catch(e) {
        console.log("[deviceProvision] verify FAILED: " + e.message);
        return Response.json({ valid: false, reason: "server_error", action: "verify", error: e.message, stack: e.stack || "", token_received_length: tokenLen, token_received_prefix: tokenPrefix, matched_device_id: null, matched_device_status: null }, { status: 500 });
      }
    }

    return Response.json({ error: "Unknown action: " + action }, { status: 400 });

  } catch(e) {
    console.log("[deviceProvision] TOP-LEVEL CATCH action=" + action + " err=" + e.message);
    return Response.json({ ok: false, action, error: e.message, stack: e.stack || "" }, { status: 500 });
  }
});