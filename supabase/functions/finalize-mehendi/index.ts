import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const ALLOWED_ORIGINS = new Set([
  "https://alponastore.com",
  "https://www.alponastore.com",
  "https://diptta386.github.io"
]);
const BUCKET = "mehendi-designs";

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://alponastore.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function sendMehendiTelegram(service: any, bookingNumber: string, booking: any) {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return;
  const { data: setting, error: settingError } = await service
    .from("notification_settings")
    .select("destination_id")
    .eq("channel", "telegram")
    .maybeSingle();
  if (settingError || !setting) return;

  try {
    const text = [
      "🌿 New Mehendi / Kolka Request",
      "",
      `Booking: ${bookingNumber}`,
      `Service: ${booking.service_type}`,
      `Date: ${booking.event_date}`,
      `Time: ${booking.preferred_time}`,
      `People: ${booking.number_of_people}`,
      `Custom designs: ${Array.isArray(booking.custom_design_paths) && booking.custom_design_paths.length ? "Yes" : "No"}`,
      "Status: Request Received"
    ].join("\n");
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: setting.destination_id,
        text,
        reply_markup: {
          inline_keyboard: [[{
            text: "Open Owner Dashboard",
            url: "https://alponastore.com/?owner=1"
          }]]
        }
      })
    });
    const result = await response.json();
    if (!response.ok || !result?.ok) throw new Error(result?.description || "Telegram send failed");
    await service.from("mehendi_bookings").update({
      telegram_notified_at: new Date().toISOString(),
      telegram_notification_error: null
    }).eq("booking_number", bookingNumber);
  } catch (error) {
    console.error("Mehendi Telegram notification failed:", error);
    await service.from("mehendi_bookings").update({
      telegram_notification_error: String(error?.message || error).slice(0, 500)
    }).eq("booking_number", bookingNumber);
  }
}

Deno.serve(async request => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: headers(origin) });
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: "Invalid origin" }), { status: 403, headers: headers(origin) });

  try {
    const body = await request.json();
    const token = String(body.session_token || "");
    if (token.length < 20) return new Response(JSON.stringify({ error: "Invalid booking session." }), { status: 400, headers: headers(origin) });

    const tokenHash = await sha256(token);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sessions, error: sessionError } = await service.from("mehendi_upload_sessions").select("*").eq("token_hash", tokenHash).limit(1);
    if (sessionError) throw sessionError;
    const session = sessions?.[0];

    if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
      return new Response(JSON.stringify({ error: "This booking session expired. Please submit again." }), { status: 400, headers: headers(origin) });
    }

    const { data: existing } = await service.from("mehendi_bookings").select("booking_number,telegram_notified_at").eq("booking_number", session.booking_number).limit(1);
    if (existing?.length) {
      if (!existing[0].telegram_notified_at) {
        await sendMehendiTelegram(service, session.booking_number, session.booking_data);
      }
      await service.from("mehendi_upload_sessions").delete().eq("token_hash", tokenHash);
      return new Response(JSON.stringify({ success: true, booking_number: session.booking_number }), { status: 200, headers: headers(origin) });
    }

    const imagePaths = Array.isArray(session.image_paths) ? session.image_paths : [];
    const folder = String(imagePaths[0] || "").split("/").slice(0, -1).join("/");
    const { data: files, error: listError } = await service.storage.from(BUCKET).list(folder, { limit: 10 });
    if (listError) throw listError;
    const names = new Set((files || []).map((file: { name: string }) => file.name));
    const requiredNames = imagePaths.map((path: string) => path.split("/").pop());
    if (requiredNames.some((name: string | undefined) => !name || !names.has(name))) {
      return new Response(JSON.stringify({ error: "Reference image upload is incomplete. Please wait and try again." }), { status: 400, headers: headers(origin) });
    }

    const { data, error } = await service.rpc("create_secure_mehendi_booking", { p_booking: session.booking_data });
    if (error) {
      if (String(error.message || "").includes("SLOT_ALREADY_BOOKED")) {
        await service.storage.from(BUCKET).remove(imagePaths);
        await service.from("mehendi_upload_sessions").delete().eq("token_hash", tokenHash);
        return new Response(JSON.stringify({
          error: "That date and time is already booked. Please choose another time."
        }), { status: 409, headers: headers(origin) });
      }
      throw error;
    }
    await service.from("mehendi_upload_sessions").delete().eq("token_hash", tokenHash);

    const finalBookingNumber = data?.booking_number || session.booking_number;
    await sendMehendiTelegram(service, finalBookingNumber, session.booking_data);

    return new Response(JSON.stringify({ success: true, booking_number: finalBookingNumber }), { status: 200, headers: headers(origin) });
  } catch (error) {
    console.error("Finalize Mehendi booking error:", error);
    return new Response(JSON.stringify({ error: "Could not finish the booking request. Please try again." }), { status: 500, headers: headers(origin) });
  }
});
