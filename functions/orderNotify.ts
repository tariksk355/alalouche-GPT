import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

Deno.serve(async (req) => {
  try {
    const { orderNumber, customerName, customerPhone, orderType, paymentMethod, customerAddress, itemsList, totalAmount, notes, customerEmail } = await req.json();

    const orderTime = new Date().toLocaleString("fr-CH", { timeZone: "Europe/Zurich", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" });

    const typeLabel = orderType === "takeaway" ? "A emporter" : "Livraison";
    const payLabel = paymentMethod === "cash" ? "Especes" : "Carte";

    // Notify restaurant owner
    await resend.emails.send({
      from: "A la louche <onboarding@resend.dev>",
      to: ["kodlantiswiss@gmail.com"],
      subject: `Nouvelle commande #${orderNumber} - ${customerName}`,
      text: `Nouvelle commande recue le ${orderTime} !\n\nNumero : ${orderNumber}\nClient : ${customerName}\nTelephone : ${customerPhone}\nType : ${typeLabel}\nPaiement : ${payLabel}\n${customerAddress ? `Adresse : ${customerAddress}\n` : ""}\nArticles :\n${itemsList}\n\nTotal : CHF ${totalAmount}\n${notes ? `\nNotes : ${notes}` : ""}`
    });

    // Confirm to customer if email provided
    if (customerEmail) {
      await resend.emails.send({
        from: "A la louche <onboarding@resend.dev>",
        to: customerEmail,
        subject: `Commande confirmee #${orderNumber} - A la louche`,
        text: `Bonjour ${customerName},\n\nVotre commande a bien ete recue !\n\nNumero de commande : ${orderNumber}\nType : ${typeLabel}\nPaiement : ${payLabel}\n\nVos articles :\n${itemsList}\n\nTotal : CHF ${totalAmount}\n\nA tres bientot !\nA la louche - 026 303 45 61`
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});