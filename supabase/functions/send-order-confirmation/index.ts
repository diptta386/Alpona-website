import { createClient } from "npm:@supabase/supabase-js@2";

const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";

Deno.serve(async (req) => {

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type"
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }

  try {

    // Check who is calling the function
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: "Not authorized"
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    const token =
      authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);

    if (
      userError ||
      !userData.user ||
      userData.user.id !== OWNER_UID
    ) {
      return new Response(
        JSON.stringify({
          error: "Owner authorization required"
        }),
        {
          status: 403,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    // Owner is authorized
    const {
      customer_email,
      customer_name,
      order_number,
      total,
      remaining_cod,
      delivery_speed,
      express_fee
    } = await req.json();

    if (!customer_email || !order_number) {
      return new Response(
        JSON.stringify({
          error: "Customer email and order number are required"
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    const resendApiKey =
      Deno.env.get("RESEND_API_KEY");

    const resendResponse =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",
          headers: {
            "Authorization":
              `Bearer ${resendApiKey}`,
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            from:
              "Alpona Orders <orders@alponastore.com>",

            to: [
              customer_email
            ],

            subject:
              `Your Alpona Order ${order_number} is Confirmed`,

            html: `
              <div style="
                max-width:600px;
                margin:auto;
                font-family:Arial,sans-serif;
                line-height:1.6;
                color:#33251f;
              ">

                <h1 style="color:#8b2018;">
                  ALPONA
                </h1>

                <h2>Your order is confirmed!</h2>

                <p>
                  Hello ${customer_name || "Customer"},
                </p>

                <p>
                  Your payment has been verified
                  and your order is confirmed.
                </p>

                <p>
                  <strong>Order Number:</strong>
                  ${order_number}
                </p>

                <p>
                  <strong>Total:</strong>
                  ৳${Number(total || 0).toLocaleString()}
                </p>

                <p>
                  <strong>Remaining COD:</strong>
                  ৳${Number(remaining_cod || 0).toLocaleString()}
                </p>

                <p>
                  <strong>Delivery:</strong>
                  ${delivery_speed === "express"
                    ? `Express processing (+৳${Number(express_fee || 0).toLocaleString()})`
                    : "Standard delivery"}
                </p>

                ${delivery_speed === "express" ? `
                  <p style="padding:12px;background:#fff4df;border:1px solid #e5cda7;">
                    Your order has priority processing and will be prepared for dispatch within 1 business day.
                    Courier delivery is normally expected within 1–3 business days after dispatch, but delays can occur.
                  </p>
                ` : ""}

                <p>
                  Thank you for shopping with Alpona.
                </p>

              </div>
            `
          })
        }
      );

    const resendData =
      await resendResponse.json();

    if (!resendResponse.ok) {

      console.error(
        "Resend error:",
        resendData
      );

      return new Response(
        JSON.stringify(resendData),
        {
          status: resendResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: resendData
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );

  } catch (error) {

    console.error(error);

    return new Response(
      JSON.stringify({
        error: String(error)
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );

  }

});
