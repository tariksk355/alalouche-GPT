import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const { orderNumber, customerName, customerPhone, orderType, paymentMethod, customerAddress, itemsList, totalAmount, notes, customerEmail } = await req.json();

    const orderTime = new Date().toLocaleString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

    // Notify restaurant owner
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: "kodlantiswiss@gmail.com",
      subject: `Nouvelle commande #${orderNumber} - ${customerName}`,
      body: `Nouvelle commande recue le ${orderTime} !\n\nNumero : ${orderNumber}\nClient : ${customerName}\nTelephone : ${customerPhone}\nType : ${orderType === "takeaway" ? "A emporter" : "Livraison"}\nPaiement : ${paymentMethod === "cash" ? "Especes" : "Carte"}\n${customerAddress ? `Adresse : ${customerAddress}\n` : ""}\nArticles :\n${itemsList}\n\nTotal : CHF ${totalAmount}\n${notes ? `\nNotes : ${notes}` : ""}`
    });

    // Confirm to customer if email provided
    if (customerEmail) {
      await base44.asServiceRole.integrations.Core.SendEmail({
        to: customerEmail,
        subject: `Commande confirmee #${orderNumber} - A la louche`,
        body: `Bonjour ${customerName},\n\nVotre commande a bien ete recue !\n\nNumero de commande : ${orderNumber}\nType : ${orderType === "takeaway" ? "A emporter" : "Livraison"}\nPaiement : ${paymentMethod === "cash" ? "Especes" : "Carte"}\n\nVos articles :\n${itemsList}\n\nTotal : CHF ${totalAmount}\n\nA tres bientot !\nA la louche - 026 303 45 61`
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});