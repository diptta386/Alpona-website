import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://alponastore.com",
  "https://www.alponastore.com",
  "https://diptta386.github.io"
]);
const BUCKET = "mehendi-designs";
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGES = 3;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

function headers(origin: string) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://alponastore.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
}

function clean(value: unknown, max: number) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
}

function safeFilename(value: unknown) {
  return clean(value, 90)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-");
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  const origin = request.headers.get("origin") || "";
  if (request.method === "OPTIONS") return new Response("ok", { headers: headers(origin) });
  if (request.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: headers(origin) });
  if (!ALLOWED_ORIGINS.has(origin)) return new Response(JSON.stringify({ error: "Invalid origin" }), { status: 403, headers: headers(origin) });

  try {
    const body = await request.json();
    if (String(body.website || "").trim()) return new Response(JSON.stringify({ error: "Invalid submission" }), { status: 400, headers: headers(origin) });

    const booking = {
      customer_name: clean(body.customer_name, 120),
      phone: clean(body.phone, 25),
      customer_email: clean(body.customer_email, 180).toLowerCase(),
      event_date: clean(body.event_date, 10),
      preferred_time: clean(body.preferred_time, 40),
      occasion: clean(body.occasion, 120),
      service_type: clean(body.service_type, 120),
      mehendi_coverage: clean(body.mehendi_coverage, 120),
      mehendi_side: clean(body.mehendi_side, 80),
      mehendi_hands: clean(body.mehendi_hands, 80),
      kolka_placement: clean(body.kolka_placement, 120),
      kolka_side: clean(body.kolka_side, 80),
      number_of_people: Number(body.number_of_people || 1),
      venue_area: clean(body.venue_area, 120),
      address: clean(body.address, 500),
      notes: clean(body.notes, 1000)
    };
    const bookingFormVersion = Number(body.booking_form_version || 1);
    const images = Array.isArray(body.images) ? body.images : [];

    if (booking.customer_name.length < 2 || !/^(?:\+?8801|01)\d{9}$/.test(booking.phone.replace(/[\s-]/g, "")) || booking.address.length < 3) {
      return new Response(JSON.stringify({ error: "Please enter valid booking details." }), { status: 400, headers: headers(origin) });
    }
    if (booking.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(booking.customer_email)) {
      return new Response(JSON.stringify({ error: "Please enter a valid email address." }), { status: 400, headers: headers(origin) });
    }
    if (bookingFormVersion >= 2 && !booking.customer_email) {
      return new Response(JSON.stringify({ error: "Email is required for appointment confirmation." }), { status: 400, headers: headers(origin) });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.event_date) || !booking.preferred_time || !booking.occasion || !booking.service_type || !booking.venue_area) {
      return new Response(JSON.stringify({ error: "Please complete all required booking fields." }), { status: 400, headers: headers(origin) });
    }
    if (!Number.isInteger(booking.number_of_people) || booking.number_of_people < 1 || booking.number_of_people > 100) {
      return new Response(JSON.stringify({ error: "Invalid number of people." }), { status: 400, headers: headers(origin) });
    }
    if (!["Morning", "Afternoon", "Evening", "Night"].includes(booking.preferred_time)) {
      return new Response(JSON.stringify({ error: "Please choose an available appointment time." }), { status: 400, headers: headers(origin) });
    }

    const needsMehendi = booking.service_type.toLowerCase().includes("mehendi");
    const needsKolka = booking.service_type.toLowerCase().includes("kolka");
    const allowedCoverage = [
      "তালু পর্যন্ত", "কবজি পর্যন্ত", "চুড়ির অবস্থান পর্যন্ত", "কনুই পর্যন্ত",
      "কনুইয়ের ওপরে / পুরো হাত", "পায়ের পাতা", "গোড়ালি পর্যন্ত", "হাঁটু পর্যন্ত", "কাস্টম দৈর্ঘ্য",
      "Palm / Wrist Length", "Bangle Length", "Elbow Length", "Above Elbow Design",
      "Above Elbow / Full Arm", "Custom Length"
    ];
    const allowedMehendiSides = ["এক পাশ", "দুই পাশ", "One Side", "Both Sides"];
    const allowedHands = ["এক হাত", "দুই হাত", "One Hand", "Both Hands"];
    const allowedKolkaPlacements = ["শুধু কপালে", "কপাল ও ভ্রুর চারপাশে", "কপাল ও গালে", "কপাল, গাল ও থুতনিতে", "কাস্টম কলকা"];
    const allowedKolkaSides = ["মাঝখানে", "এক পাশে", "দুই পাশে সমান", "পুরো মুখে"];

    if (needsMehendi && (!allowedCoverage.includes(booking.mehendi_coverage) || !allowedMehendiSides.includes(booking.mehendi_side) || !allowedHands.includes(booking.mehendi_hands))) {
      return new Response(JSON.stringify({ error: "Please choose the Mehendi length, design side, and hands." }), { status: 400, headers: headers(origin) });
    }
    const hasKolkaSelections = Boolean(booking.kolka_placement || booking.kolka_side);
    if (needsKolka && hasKolkaSelections && (!allowedKolkaPlacements.includes(booking.kolka_placement) || !allowedKolkaSides.includes(booking.kolka_side))) {
      return new Response(JSON.stringify({ error: "Please choose the Kolka placement and side." }), { status: 400, headers: headers(origin) });
    }
    if (images.length > MAX_IMAGES) {
      return new Response(JSON.stringify({ error: "You can upload up to 3 reference images." }), { status: 400, headers: headers(origin) });
    }
    for (const image of images) {
      if (!IMAGE_TYPES.has(String(image.type || "")) || Number(image.size || 0) <= 0 || Number(image.size || 0) > MAX_IMAGE_SIZE) {
        return new Response(JSON.stringify({ error: "Invalid reference image." }), { status: 400, headers: headers(origin) });
      }
    }

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: blockedSlot, error: blockedError } = await service
      .from("mehendi_bookings")
      .select("id")
      .eq("event_date", booking.event_date)
      .eq("preferred_time", booking.preferred_time)
      .in("status", ["Confirmed", "Completed"])
      .limit(1);
    if (blockedError) throw blockedError;
    if (blockedSlot?.length) {
      return new Response(JSON.stringify({ error: "That date and time is already booked. Please choose another time." }), { status: 409, headers: headers(origin) });
    }

    const ip = (request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const keyHash = await sha256(ip + "|mehendi");
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await service.from("submission_rate_limits").select("id", { count: "exact", head: true }).eq("kind", "mehendi").eq("key_hash", keyHash).gte("created_at", since);
    if ((count || 0) >= 5) return new Response(JSON.stringify({ error: "Too many booking attempts. Please wait and try again later." }), { status: 429, headers: headers(origin) });
    await service.from("submission_rate_limits").insert({ kind: "mehendi", key_hash: keyHash });

    const bookingNumber = "MEH-" + Date.now().toString().slice(-8) + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();
    const bookingData = { ...booking, booking_number: bookingNumber, custom_design_paths: [] as string[] };

    if (!images.length) {
      const { data, error } = await service.rpc("create_secure_mehendi_booking", { p_booking: bookingData });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, booking_number: data?.booking_number || bookingNumber }), { status: 200, headers: headers(origin) });
    }

    const sessionToken = crypto.randomUUID() + crypto.randomUUID();
    const tokenHash = await sha256(sessionToken);
    const folder = "references/" + bookingNumber + "-" + crypto.randomUUID();
    const imagePaths = images.map((image: { name?: string }, index: number) =>
      folder + "/design-" + (index + 1) + "-" + safeFilename(image.name || `reference-${index + 1}.jpg`)
    );
    bookingData.custom_design_paths = imagePaths;

    const uploads = [];
    for (let index = 0; index < imagePaths.length; index++) {
      const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(imagePaths[index]);
      if (error) throw error;
      uploads.push({ index, path: imagePaths[index], token: data.token });
    }

    const { error: sessionError } = await service.from("mehendi_upload_sessions").insert({
      token_hash: tokenHash,
      booking_number: bookingNumber,
      booking_data: bookingData,
      image_paths: imagePaths,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
    });
    if (sessionError) throw sessionError;

    return new Response(JSON.stringify({
      success: true,
      upload_required: true,
      booking_number: bookingNumber,
      session_token: sessionToken,
      uploads
    }), { status: 200, headers: headers(origin) });
  } catch (error) {
    console.error("Secure Mehendi booking error:", error);
    if (String(error?.message || "").includes("SLOT_ALREADY_BOOKED")) {
      return new Response(JSON.stringify({ error: "That date and time is already booked. Please choose another time." }), { status: 409, headers: headers(origin) });
    }
    return new Response(JSON.stringify({ error: "Could not submit booking request. Please try again." }), { status: 500, headers: headers(origin) });
  }
});
