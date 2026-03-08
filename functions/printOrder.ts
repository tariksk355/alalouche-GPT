import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { orderId } = await req.json();

    if (!orderId) {
      return Response.json({ error: 'Order ID gerekli' }, { status: 400 });
    }

    // Siparişi getir
    const order = await base44.asServiceRole.entities.Order.get(orderId);
    if (!order) {
      return Response.json({ error: 'Sipariş bulunamadı' }, { status: 404 });
    }

    // Müşterinin toplam sipariş sayısını hesapla
    const allCustomerOrders = await base44.asServiceRole.entities.Order.filter({
      customer_phone: order.customer_phone
    });
    const orderNumber = allCustomerOrders.length;

    // Yazıcı ayarlarını getir
    const settings = await base44.asServiceRole.entities.PrinterSettings.list();
    const printerSettings = settings.length > 0 ? settings[0] : null;

    // Eğer auto_print false ise, yazdırma işlemi gerçekleştirilmez
    if (printerSettings && printerSettings.auto_print === false) {
      return Response.json({ error: 'Otomatik yazdırma devre dışı' }, { status: 400 });
    }

    // Sipariş verilerini formatlama
    const itemsList = order.items
      .map(item => `${item.quantity}x ${item.name} - CHF ${(item.price * item.quantity).toFixed(2)}`)
      .join('\n');

    const typeLabel = order.order_type === 'takeaway' ? 'A emporter' : 'Livraison';
    const paymentLabel = order.payment_method === 'cash' ? 'Especes' : 'Carte';
    const prepTime = order.prep_time_minutes || printerSettings.default_prep_time || 30;

    // Sipariş verilerini basit format olarak hazırla
    const printContent = `
═════════════════════════
  COMMANDE #${order.order_number}
═════════════════════════
${new Date(order.created_date).toLocaleString('fr-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}

CLIENT: ${order.customer_name}
TEL: ${order.customer_phone}
TYPE: ${typeLabel}
PAIEMENT: ${paymentLabel}

─────────────────────────
${itemsList}
─────────────────────────
TOTAL: CHF ${order.total_amount?.toFixed(2)}
TOTAL ORDERS: ${orderNumber}
${order.customer_address ? `ADRESSE: ${order.customer_address}` : ''}
${order.notes ? `NOTES: ${order.notes}` : ''}
PREP TIME: ${prepTime} min
═════════════════════════
    `;

    let deviceMode = 'simulation';

    // Si device_token est configuré, envoyer à Sunmi API
    if (printerSettings && printerSettings.device_token) {
      try {
        const printPayload = {
          device_token: printerSettings.device_token,
          order_number: order.order_number,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone,
          order_type: typeLabel,
          payment_method: paymentLabel,
          items: itemsList,
          total_amount: order.total_amount,
          prep_time_minutes: prepTime,
          customer_address: order.customer_address || null,
          notes: order.notes || null,
          timestamp: new Date().toISOString(),
          paper_width: printerSettings.paper_width || '58mm',
          copies: printerSettings.copies || 1
        };

        const sunmiResponse = await fetch('https://api.sunmi.com/cloudprint/print', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${printerSettings.device_token}`
          },
          body: JSON.stringify(printPayload)
        });

        if (sunmiResponse && sunmiResponse.ok) {
          deviceMode = 'device';
        }
      } catch (err) {
        console.log('Sunmi API erreur, mode simulation utilisé:', err.message);
      }
    }

    // Siparişi yazdırıldı olarak işaretle
    await base44.asServiceRole.entities.Order.update(orderId, {
      printed: true,
      printed_at: new Date().toISOString()
    });

    return Response.json({ 
      success: true, 
      message: `Sipariş yazıcıya gönderildi (${deviceMode})`,
      printed: true,
      device_mode: deviceMode
    });
  } catch (error) {
    console.error('Print error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});