import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
const ALLOWED_ORIGINS = new Set([
  "https://alponastore.com",
  "https://www.alponastore.com",
  "https://diptta386.github.io"
]);

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://alponastore.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

Deno.serve(async request => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: headers(origin) });
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: "Invalid origin" }), { status: 403, headers: headers(origin) });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Owner login required" }), { status: 401, headers: headers(origin) });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(url, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || userData.user?.id !== OWNER_UID) {
      return new Response(JSON.stringify({ error: "Owner authorization required" }), { status: 403, headers: headers(origin) });
    }

    const body = await request.json();
    const bookingId = Number(body.booking_id);
    const status = String(body.status || "").trim();
    if (!Number.isInteger(bookingId) || bookingId < 1) {
      return new Response(JSON.stringify({ error: "Invalid booking" }), { status: 400, headers: headers(origin) });
    }

    const owner = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const { data: booking, error: updateError } = await owner.rpc(
      "update_mehendi_booking_status",
      { p_booking_id: bookingId, p_status: status }
    );

    if (updateError) {
      const isConflict = String(updateError.message || "").includes("SLOT_ALREADY_BOOKED");
      const isPaidCancellation = String(updateError.message || "").includes("PAID_BOOKING_NON_CANCELLABLE");
      return new Response(JSON.stringify({
        error: isPaidCancellation
          ? "A paid booking cannot be cancelled under the accepted booking policy."
          : isConflict
          ? "That date and time has already been confirmed for another customer."
          : "Could not update the booking."
      }), { status: isConflict || isPaidCancellation ? 409 : 400, headers: headers(origin) });
    }

    let emailSent = false;
    let emailError = "";
    if (status === "Confirmed" && !booking?.customer_email) {
      emailError = "The booking was confirmed, but this customer did not provide an email address.";
    } else if (status === "Confirmed" && booking?.customer_email && !booking?.confirmation_email_sent_at) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) {
        emailError = "Confirmation email service is not configured.";
      } else {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Alpona Appointments <orders@alponastore.com>",
            to: [booking.customer_email],
            subject: `Your Alpona Appointment ${booking.booking_number} is Confirmed`,
            html: `
              <div style="max-width:600px;margin:auto;font-family:Arial,sans-serif;line-height:1.65;color:#33251f">
                <h1 style="color:#8b2018">ALPONA</h1>
                <h2>Your Mehendi / Kolka appointment is confirmed</h2>
                <p>Hello ${escapeHtml(booking.customer_name)},</p>
                <p>We have confirmed your appointment with Alpona.</p>
                <p><strong>Booking reference:</strong> ${escapeHtml(booking.booking_number)}</p>
                <p><strong>Service:</strong> ${escapeHtml(booking.service_type)}</p>
                <p><strong>Date:</strong> ${escapeHtml(booking.event_date)}</p>
                <p><strong>Time:</strong> ${escapeHtml(booking.preferred_time)}</p>
                <p><strong>Venue:</strong> ${escapeHtml(booking.venue_area)}, ${escapeHtml(booking.address)}</p>
                ${booking.catalog_total != null ? `<p><strong>Approved estimated total:</strong> BDT ${escapeHtml(booking.catalog_total)}</p><p>Alpona will send your full-payment instructions separately. Your appointment is secured after payment. Once paid, the booking is non-cancellable under the policy accepted with your request.</p>` : ""}
                <p>We will contact you if any final details are needed.</p>
              </div>
            `
          })
        });

        if (response.ok) {
          emailSent = true;
          const { error: stampError } = await owner
            .from("mehendi_bookings")
            .update({ confirmation_email_sent_at: new Date().toISOString() })
            .eq("id", bookingId);
          if (stampError) console.error("Could not stamp confirmation email:", stampError);
        } else {
          const detail = await response.text();
          console.error("Resend appointment email error:", detail);
          emailError = "The booking was confirmed, but the confirmation email could not be sent.";
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      booking,
      email_sent: emailSent,
      email_error: emailError
    }), { status: 200, headers: headers(origin) });
  } catch (error) {
    console.error("Update Mehendi booking error:", error);
    return new Response(JSON.stringify({ error: "Could not update the booking." }), { status: 500, headers: headers(origin) });
  }
});
