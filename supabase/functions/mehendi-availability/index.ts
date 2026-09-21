import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async request => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: headers(origin) });
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: "Invalid origin" }), { status: 403, headers: headers(origin) });

  try {
    const body = await request.json();
    const eventDate = String(body.event_date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      return new Response(JSON.stringify({ error: "Valid event date required" }), { status: 400, headers: headers(origin) });
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data, error } = await service
      .from("mehendi_bookings")
      .select("preferred_time")
      .eq("event_date", eventDate)
      .in("status", ["Confirmed", "Completed"]);

    if (error) throw error;

    return new Response(JSON.stringify({
      success: true,
      event_date: eventDate,
      unavailable_times: [...new Set((data || []).map(row => row.preferred_time))]
    }), { status: 200, headers: headers(origin) });
  } catch (error) {
    console.error("Mehendi availability error:", error);
    return new Response(JSON.stringify({ error: "Could not check appointment availability." }), { status: 500, headers: headers(origin) });
  }
});
