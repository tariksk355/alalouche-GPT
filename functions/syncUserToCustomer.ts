import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    // Order create event
    if (event.entity_name === 'Order' && event.type === 'create') {
      const order = await base44.asServiceRole.entities.Order.get(event.entity_id);
      
      if (!order) {
        return Response.json({ error: 'Order not found' }, { status: 404 });
      }

      // Customer phone ile kontrol et
      const existingCustomer = await base44.asServiceRole.entities.Customer.filter({
        phone: order.customer_phone
      });

      if (existingCustomer.length === 0) {
        // Yeni customer oluştur
        await base44.asServiceRole.entities.Customer.create({
          name: order.customer_name,
          email: order.customer_email || '',
          phone: order.customer_phone,
          address: order.customer_address || '',
          notes: 'Auto-created from order'
        });
      } else {
        // Var olan müşterinin email ve address bilgisini güncelle
        const customer = existingCustomer[0];
        const updates = {};
        
        if (order.customer_email && !customer.email) {
          updates.email = order.customer_email;
        }
        if (order.customer_address && !customer.address) {
          updates.address = order.customer_address;
        }
        
        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.Customer.update(customer.id, updates);
        }
      }
      return Response.json({ success: true, message: 'Customer synchronized from order' });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('Sync error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});