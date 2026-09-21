import { createClient } from "npm:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://alponastore.com",
  "https://www.alponastore.com",
  "https://diptta386.github.io"
]);
const EXPRESS_FEE = 120;

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://alponastore.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" }
  });
}

async function sha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2,"0")).join("");
}

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().replace(/[<>]/g, "").slice(0, max);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    return json(req, { error: "Invalid origin" }, 403);
  }

  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();

    if (String(body.honeypot || "").trim()) {
      return json(req, { error: "Invalid submission" }, 400);
    }

    const customer = body.customer || {};
    const requestedItems = Array.isArray(body.items) ? body.items : [];

    const name = cleanText(customer.name, 120);
    const phone = cleanText(customer.phone, 25);
    const email = cleanText(customer.email, 180).toLowerCase();
    const address = cleanText(customer.address, 500);
    const cityId = Number(customer.pathao_city_id);
    const zoneId = Number(customer.pathao_zone_id);
    const areaId = Number(customer.pathao_area_id);
    const cityName = cleanText(customer.pathao_city_name, 120);
    const zoneName = cleanText(customer.pathao_zone_name, 120);
    const areaName = cleanText(customer.pathao_area_name, 120);
    const paymentOption = String(body.payment_option || "");
    const deliverySpeed = String(body.delivery_speed || "standard");
    const advanceMethod = String(body.advance_method || "");
    const txn = cleanText(body.advance_transaction_id, 40);

    if (name.length < 2 || address.length < 5) {
      return json(req, { error: "Please enter valid customer details." }, 400);
    }

    if (!/^(?:\+?8801|01)\d{9}$/.test(phone.replace(/[\s-]/g, ""))) {
      return json(req, { error: "Please enter a valid Bangladesh mobile number." }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(req, { error: "Please enter a valid email address." }, 400);
    }

    if (!cityId || !zoneId || !areaId || !cityName || !zoneName || !areaName) {
      return json(req, { error: "Please select a valid City, Zone and Area." }, 400);
    }

    if (!["full_payment","delivery_only"].includes(paymentOption)) {
      return json(req, { error: "Invalid payment option." }, 400);
    }

    if (!["standard", "express"].includes(deliverySpeed)) {
      return json(req, { error: "Invalid delivery speed." }, 400);
    }

    if (!["bKash","Nagad"].includes(advanceMethod)) {
      return json(req, { error: "Invalid payment method." }, 400);
    }

    if (!/^[A-Za-z0-9]{6,40}$/.test(txn)) {
      return json(req, { error: "Please enter a valid transaction ID." }, 400);
    }

    if (!requestedItems.length || requestedItems.length > 20) {
      return json(req, { error: "Invalid cart." }, 400);
    }

    const ip = (
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for") ||
      "unknown"
    ).split(",")[0].trim();
    const ua = req.headers.get("user-agent") || "";
    const keyHash = await sha256(ip + "|" + ua);

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentCount } = await service
      .from("submission_rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("kind", "order")
      .eq("key_hash", keyHash)
      .gte("created_at", tenMinutesAgo);

    if ((recentCount || 0) >= 5) {
      return json(req, { error: "Too many order attempts. Please wait a few minutes and try again." }, 429);
    }

    await service.from("submission_rate_limits").insert({
      kind: "order",
      key_hash: keyHash
    });

    const { data: duplicate } = await service
      .from("orders")
      .select("id")
      .ilike("advance_method", advanceMethod)
      .ilike("advance_transaction_id", txn)
      .limit(1);

    if (duplicate && duplicate.length) {
      return json(req, { error: "This transaction ID has already been used for an order." }, 409);
    }

    const productIds = requestedItems.map((x:any) => Number(x.product_id));
    if (productIds.some((id:number) => !Number.isInteger(id) || id <= 0)) {
      return json(req, { error: "Invalid product." }, 400);
    }

    const { data: products, error: productError } = await service
      .from("products")
      .select("id,name,price,cost,stock,weight_kg,active")
      .in("id", productIds);

    if (productError) throw productError;

    const productMap = new Map((products || []).map((p:any) => [Number(p.id), p]));
    const items:any[] = [];
    let subtotal = 0;
    let totalWeight = 0;
    let totalQty = 0;

    for (const requested of requestedItems) {
      const product = productMap.get(Number(requested.product_id));
      const qty = Number(requested.quantity);

      if (!product || !product.active) {
        return json(req, { error: "One of the products is no longer available." }, 400);
      }

      if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
        return json(req, { error: "Invalid product quantity." }, 400);
      }

      if (qty > Number(product.stock || 0)) {
        return json(req, { error: product.name + " does not have enough stock." }, 409);
      }

      totalQty += qty;
      if (totalQty > 30) {
        return json(req, { error: "Too many items in one order." }, 400);
      }

      const price = Number(product.price || 0);
      const cost = Number(product.cost || 0);
      const weight = Number(product.weight_kg || 0.5);

      subtotal += price * qty;
      totalWeight += weight * qty;

      items.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        price,
        cost
      });
    }

    totalWeight = Math.max(0.5, Number(totalWeight.toFixed(2)));
    if (totalWeight > 10) {
      return json(req, { error: "This order is over the 10 KG delivery limit." }, 400);
    }

    const baseUrl = Deno.env.get("PATHAO_BASE_URL");
    const clientId = Deno.env.get("PATHAO_CLIENT_ID");
    const clientSecret = Deno.env.get("PATHAO_CLIENT_SECRET");
    const username = Deno.env.get("PATHAO_USERNAME");
    const password = Deno.env.get("PATHAO_PASSWORD");

    if (!baseUrl || !clientId || !clientSecret || !username || !password) {
      throw new Error("Pathao configuration is missing");
    }

    const tokenRes = await fetch(baseUrl + "/aladdin/api/v1/issue-token", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        username,
        password,
        grant_type: "password"
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw new Error("Could not connect to Pathao");

    const priceRes = await fetch(baseUrl + "/aladdin/api/v1/merchant/price-plan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Accept": "application/json",
        "Authorization": "Bearer " + tokenData.access_token
      },
      body: JSON.stringify({
        store_id: 437765,
        item_type: 2,
        delivery_type: 48,
        item_weight: totalWeight,
        recipient_city: cityId,
        recipient_zone: zoneId
      })
    });

    const priceData = await priceRes.json();
    if (!priceRes.ok) throw new Error("Could not calculate delivery fee");

    const baseDeliveryFee = Number(priceData?.data?.final_price || 0);
    const codPercentage = Number(priceData?.data?.cod_percentage || 0);

    if (!(baseDeliveryFee > 0)) throw new Error("Invalid delivery fee");

    let deliveryFee = baseDeliveryFee;
    if (paymentOption === "delivery_only") {
      deliveryFee = Math.ceil(baseDeliveryFee + subtotal * codPercentage);
    }

    const expressFee = deliverySpeed === "express" ? EXPRESS_FEE : 0;
    const total = subtotal + deliveryFee + expressFee;
    const securedAdvanceAmount = paymentOption === "full_payment"
      ? total
      : deliveryFee + expressFee;
    const remainingCOD = paymentOption === "full_payment" ? 0 : subtotal;
    const orderNumber = "ALP-" + Date.now() + "-" + Math.random().toString(36).slice(2,5).toUpperCase();

    const order = {
      order_number: orderNumber,
      customer_name: name,
      phone,
      customer_email: email,
      address,
      area: areaName,
      pathao_city_id: cityId,
      pathao_city_name: cityName,
      pathao_zone_id: zoneId,
      pathao_zone_name: zoneName,
      pathao_area_id: areaId,
      pathao_area_name: areaName,
      payment_method: advanceMethod,
      payment_option: paymentOption,
      subtotal,
      delivery_fee: deliveryFee,
      delivery_speed: deliverySpeed,
      express_fee: expressFee,
      total,
      advance_method: advanceMethod,
      advance_transaction_id: txn,
      advance_amount: securedAdvanceAmount,
      remaining_cod: remainingCOD
    };

    const { data: created, error: createError } = await service.rpc(
      "create_secure_order",
      { p_order: order, p_items: items }
    );

    if (createError) throw createError;

    return json(req, {
      success: true,
      order_number: created?.order_number || orderNumber,
      total,
      advance_amount: securedAdvanceAmount,
      remaining_cod: remainingCOD,
      delivery_fee: deliveryFee,
      delivery_speed: deliverySpeed,
      express_fee: expressFee
    });

  } catch (error) {
    console.error("Secure order error:", error);
    return json(req, { error: "Order could not be submitted. Please try again." }, 500);
  }
});
