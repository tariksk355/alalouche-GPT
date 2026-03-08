import { Resend } from 'npm:resend@4.0.0';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

Deno.serve(async (req) => {
  try {
    const { emails, subject, body } = await req.json();

    if (!Array.isArray(emails) || emails.length === 0) {
      return Response.json({ error: 'No recipient emails provided' }, { status: 400 });
    }

    const results = await Promise.allSettled(
      emails.map(email => resend.emails.send({
        from: "A la louche <onboarding@resend.dev>",
        to: email,
        subject: subject,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
          <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/user_6988e8d4fc295c9d940c5901/05562fbc0_Alalouche-logo.png" alt="A la louche" style="height:60px;margin-bottom:24px;" />
          <div style="font-size:15px;line-height:1.6;color:#333;">${body.replace(/\n/g, '<br>')}</div>
          <hr style="margin:32px 0;border:none;border-top:1px solid #eee;" />
          <p style="font-size:12px;color:#999;">A la louche - Rte de Chantemerle 58, 1763 Granges-Paccot - 026 303 45 61</p>
        </div>`
      }))
    );

    const sentCount = results.filter(r => r.status === 'fulfilled').length;
    const failedCount = results.filter(r => r.status === 'rejected').length;
    const errors = results.filter(r => r.status === 'rejected').map(r => r.reason?.message);

    return Response.json({ success: true, sentCount, failedCount, errors });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});