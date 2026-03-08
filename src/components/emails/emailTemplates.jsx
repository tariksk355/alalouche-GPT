// Professional HTML email templates for À la louche

const baseHeader = `
  <tr><td style="background:#111111;padding:40px 40px 32px;text-align:center;">
    <div style="font-size:30px;font-style:italic;color:#ffffff;font-family:Georgia,serif;letter-spacing:0.5px;">À la louche</div>
    <div style="color:#888888;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Kebab Artisanal · Granges-Paccot</div>
  </td></tr>
`;

const baseFooter = `
  <tr><td style="padding:20px 40px;background:#f7f7f7;border-top:1px solid #eeeeee;text-align:center;">
    <p style="margin:0 0 4px;color:#aaaaaa;font-size:12px;">Rte de Chantemerle 58, 1763 Granges-Paccot</p>
    <p style="margin:0;color:#aaaaaa;font-size:12px;">026 303 45 61 · info@alalouche.ch</p>
    <p style="margin:8px 0 0;color:#cccccc;font-size:11px;">© ${new Date().getFullYear()} À la louche</p>
  </td></tr>
`;

const detailsBox = ({ date, time, guests, notes }) => `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #eeeeee;margin-bottom:28px;">
    <tr><td style="padding:24px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;">
          <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Date</span>
          <span style="float:right;color:#111111;font-weight:700;font-size:15px;">${date}</span>
        </td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;">
          <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Heure</span>
          <span style="float:right;color:#111111;font-weight:700;font-size:15px;">${time}</span>
        </td></tr>
        <tr><td style="padding:10px 0;${notes ? "border-bottom:1px solid #eeeeee;" : ""}">
          <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Personnes</span>
          <span style="float:right;color:#111111;font-weight:700;font-size:15px;">${guests} personne${guests > 1 ? "s" : ""}</span>
        </td></tr>
        ${notes ? `<tr><td style="padding:10px 0;"><span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Notes</span><span style="float:right;color:#555555;font-size:14px;max-width:300px;text-align:right;">${notes}</span></td></tr>` : ""}
      </table>
    </td></tr>
  </table>
`;

const wrapEmail = (content) => `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f0f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.10);">
        ${content}
      </table>
    </td></tr>
  </table>
</body>
</html>
`;

// ── 1. Reservation REQUEST received (sent to customer immediately) ─────────────
export const reservationRequestEmail = ({ name, date, time, guests, notes }) => wrapEmail(`
  ${baseHeader}
  <tr><td style="background:#b5122a;height:4px;"></td></tr>
  <tr><td style="padding:40px;">
    <h1 style="margin:0 0 8px;font-size:22px;color:#111111;font-weight:700;">Demande reçue 📋</h1>
    <p style="margin:0 0 24px;color:#555555;font-size:15px;line-height:1.6;">
      Bonjour <strong>${name}</strong>,<br><br>
      Nous avons bien reçu votre demande de réservation. Notre équipe va examiner les disponibilités et vous confirmera (ou non) votre table dans les plus brefs délais.
    </p>

    ${detailsBox({ date, time, guests, notes })}

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border-radius:8px;border:1px solid #fde68a;margin-bottom:28px;">
      <tr><td style="padding:18px 22px;">
        <div style="color:#92400e;font-size:14px;line-height:1.6;">
          ⏳ <strong>En attente de confirmation</strong> — Vous recevrez un email dès que votre réservation sera traitée par notre équipe.
        </div>
      </td></tr>
    </table>

    <p style="margin:0 0 8px;color:#888888;font-size:13px;line-height:1.6;">
      Pour toute question, contactez-nous au <strong style="color:#111111;">026 303 45 61</strong> ou par email à <strong style="color:#111111;">info@alalouche.ch</strong>.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:8px;margin-top:28px;">
      <tr><td style="padding:20px 24px;">
        <div style="color:#ffffff;font-size:14px;font-weight:600;margin-bottom:4px;">À la louche</div>
        <div style="color:#aaaaaa;font-size:13px;">Rte de Chantemerle 58, 1763 Granges-Paccot</div>
        <div style="color:#aaaaaa;font-size:13px;margin-top:2px;">026 303 45 61 · info@alalouche.ch</div>
      </td></tr>
    </table>
  </td></tr>
  ${baseFooter}
`);

// ── 2. Reservation STATUS update (confirmed or cancelled by admin) ────────────
export const reservationStatusEmail = ({ name, date, time, guests, status }) => {
  const isConfirmed = status === "confirmed";
  const accentColor = isConfirmed ? "#16a34a" : "#b5122a";
  const icon = isConfirmed ? "✅" : "❌";
  const statusLabel = isConfirmed ? "Réservation confirmée" : "Réservation non disponible";
  const statusMessage = isConfirmed
    ? `Bonne nouvelle ! Votre réservation a été <strong>confirmée</strong> par notre équipe. Nous avons hâte de vous accueillir !`
    : `Nous sommes désolés, mais nous ne pouvons pas honorer votre demande de réservation pour cette date. N'hésitez pas à nous contacter pour trouver une autre disponibilité.`;

  return wrapEmail(`
    ${baseHeader}
    <tr><td style="background:${accentColor};height:4px;"></td></tr>
    <tr><td style="padding:40px;">
      <h1 style="margin:0 0 8px;font-size:22px;color:#111111;font-weight:700;">${icon} ${statusLabel}</h1>
      <p style="margin:0 0 28px;color:#555555;font-size:15px;line-height:1.6;">
        Bonjour <strong>${name}</strong>,<br><br>${statusMessage}
      </p>

      ${detailsBox({ date, time, guests })}

      ${isConfirmed ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:8px;border:1px solid #bbf7d0;margin-bottom:28px;">
        <tr><td style="padding:18px 22px;">
          <div style="color:#166534;font-size:14px;line-height:1.6;">
            📍 Pensez à vous présenter à l'heure. En cas d'empêchement, merci de nous prévenir au <strong>026 303 45 61</strong> au moins 2 heures avant.
          </div>
        </td></tr>
      </table>
      ` : `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border-radius:8px;border:1px solid #fecaca;margin-bottom:28px;">
        <tr><td style="padding:18px 22px;">
          <div style="color:#991b1b;font-size:14px;line-height:1.6;">
            📞 Appelez-nous au <strong>026 303 45 61</strong> ou écrivez à <strong>info@alalouche.ch</strong> pour trouver une autre date.
          </div>
        </td></tr>
      </table>
      `}

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;border-radius:8px;">
        <tr><td style="padding:20px 24px;">
          <div style="color:#ffffff;font-size:14px;font-weight:600;margin-bottom:4px;">À la louche</div>
          <div style="color:#aaaaaa;font-size:13px;">Rte de Chantemerle 58, 1763 Granges-Paccot</div>
          <div style="color:#aaaaaa;font-size:13px;margin-top:2px;">026 303 45 61 · info@alalouche.ch</div>
        </td></tr>
      </table>
    </td></tr>
    ${baseFooter}
  `);
};

// ── 3. New reservation NOTIFICATION (sent to restaurant admin) ────────────────
export const newReservationNotifyEmail = ({ name, email, phone, date, time, guests, notes }) => wrapEmail(`
  ${baseHeader}
  <tr><td style="background:#b5122a;height:4px;"></td></tr>
  <tr><td style="padding:40px;">
    <h2 style="margin:0 0 20px;font-size:20px;color:#111111;font-weight:700;">🔔 Nouvelle demande de réservation</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:8px;border:1px solid #eeeeee;margin-bottom:24px;">
      <tr><td style="padding:24px 28px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;">
            <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Client</span>
            <span style="float:right;color:#111111;font-weight:700;">${name}</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;">
            <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Téléphone</span>
            <span style="float:right;color:#111111;font-weight:700;">${phone}</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;">
            <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Email</span>
            <span style="float:right;color:#555555;">${email || "—"}</span>
          </td></tr>
          <tr><td style="padding:10px 0;border-bottom:1px solid #eeeeee;">
            <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Date &amp; Heure</span>
            <span style="float:right;color:#111111;font-weight:700;">${date} à ${time}</span>
          </td></tr>
          <tr><td style="padding:10px 0;${notes ? "border-bottom:1px solid #eeeeee;" : ""}">
            <span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Personnes</span>
            <span style="float:right;color:#111111;font-weight:700;">${guests}</span>
          </td></tr>
          ${notes ? `<tr><td style="padding:10px 0;"><span style="color:#999999;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Notes</span><span style="float:right;color:#555555;font-size:14px;">${notes}</span></td></tr>` : ""}
        </table>
      </td></tr>
    </table>
    <p style="margin:0;color:#888888;font-size:13px;text-align:center;">Connectez-vous à votre tableau de bord pour confirmer ou annuler cette réservation.</p>
  </td></tr>
  ${baseFooter}
`);