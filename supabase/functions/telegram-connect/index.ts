import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
const ALLOWED_ORIGINS = new Set([
  "https://alponastore.com",
  "https://www.alponastore.com",
  "https://diptta386.github.io"
]);

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

function readJwtPayload(token: string) {
  const payload = token.split(".")[1] || "";
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

async function telegram(token: string, method: string, body?: unknown) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok || !data?.ok) {
    throw new Error(String(data?.description || `Telegram ${method} failed`).slice(0, 300));
  }
  return data.result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const origin = req.headers.get("origin") || "";
  if (!ALLOWED_ORIGINS.has(origin)) return json(req, { error: "Invalid origin" }, 403);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const accessToken = authHeader.replace("Bearer ", "");
    if (!accessToken) return json(req, { error: "Owner login required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData, error: userError } = await authClient.auth.getUser(accessToken);

    let aal = "";
    try {
      aal = String(readJwtPayload(accessToken)?.aal || "");
    } catch (_) {
      return json(req, { error: "Invalid owner session" }, 401);
    }

    if (userError || userData.user?.id !== OWNER_UID || aal !== "aal2") {
      return json(req, { error: "Owner MFA session required" }, 403);
    }

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) return json(req, { error: "TELEGRAM_BOT_TOKEN is not configured" }, 503);

    const service = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status");
    const bot = await telegram(botToken, "getMe");

    if (action === "status") {
      const { data: setting, error } = await service
        .from("notification_settings")
        .select("destination_type,bot_username,connected_at,updated_at")
        .eq("channel", "telegram")
        .maybeSingle();
      if (error) throw error;
      return json(req, {
        success: true,
        connected: Boolean(setting),
        bot_username: setting?.bot_username || bot.username || null,
        connected_at: setting?.connected_at || null
      });
    }

    if (action === "connect") {
      const webhook = await telegram(botToken, "getWebhookInfo");
      if (webhook?.url) {
        return json(req, { error: "This bot already has a webhook. Remove it in BotFather or use a new Alpona bot." }, 409);
      }

      const updates = await telegram(botToken, "getUpdates");
      const match = [...(updates || [])].reverse().find((update: any) =>
        update?.message?.chat?.type === "private" &&
        String(update?.message?.text || "").trim().toLowerCase() === "connect"
      );

      if (!match?.message?.chat?.id) {
        return json(req, {
          error: "No private ‘connect’ message found. Open your bot, press Start, send connect, then try again."
        }, 404);
      }

      const chatId = Number(match.message.chat.id);
      const now = new Date().toISOString();
      const { error } = await service.from("notification_settings").upsert({
        channel: "telegram",
        destination_id: chatId,
        destination_type: "private",
        bot_username: bot.username || null,
        connected_at: now,
        updated_at: now
      }, { onConflict: "channel" });
      if (error) throw error;

      await telegram(botToken, "sendMessage", {
        chat_id: chatId,
        text: "✅ Alpona alerts connected. New product orders and Mehendi/Kolka bookings will appear here.",
        reply_markup: {
          inline_keyboard: [[{
            text: "Open Owner Dashboard",
            url: "https://alponastore.com/?owner=1"
          }]]
        }
      });

      return json(req, {
        success: true,
        connected: true,
        bot_username: bot.username || null
      });
    }

    if (action === "test") {
      const { data: setting, error } = await service
        .from("notification_settings")
        .select("destination_id")
        .eq("channel", "telegram")
        .maybeSingle();
      if (error) throw error;
      if (!setting) return json(req, { error: "Telegram is not connected" }, 409);

      await telegram(botToken, "sendMessage", {
        chat_id: setting.destination_id,
        text: "🔔 Alpona test alert\n\nTelegram notifications are working.",
        reply_markup: {
          inline_keyboard: [[{
            text: "Open Owner Dashboard",
            url: "https://alponastore.com/?owner=1"
          }]]
        }
      });
      return json(req, { success: true, sent: true });
    }

    return json(req, { error: "Invalid action" }, 400);
  } catch (error) {
    console.error("Telegram connection error:", error);
    return json(req, { error: String(error?.message || "Telegram connection failed").slice(0, 300) }, 500);
  }
});
