(function () {
  const sent = new Map();
  const originalConsoleError = console.error.bind(console);

  function scrub(value) {
    let text = String(value || "");
    text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
    text = text.replace(/\+?\d[\d\s()-]{7,}\d/g, "[phone]");
    return text.slice(0, 900);
  }

  function hash(text) {
    let h = 0;
    for (let i = 0; i < text.length; i++) {
      h = ((h << 5) - h) + text.charCodeAt(i);
      h |= 0;
    }
    return String(Math.abs(h));
  }

  function describe(value) {
    if (value instanceof Error) {
      return [value.name, value.message, value.stack]
        .filter(Boolean)
        .join("\n");
    }

    if (typeof value === "string") return value;

    try {
      return JSON.stringify(value);
    } catch (_) {
      return String(value);
    }
  }

  async function reportError(type, message, severity, details) {
    try {
      if (typeof db === "undefined") return;

      const safeMessage = scrub(message);
      if (!safeMessage) return;

      const pageUrl =
        location.origin + location.pathname;

      const fingerprint =
        hash(type + "|" + safeMessage + "|" + pageUrl);

      const now = Date.now();
      const last = sent.get(fingerprint) || 0;

      if (now - last < 60000) return;
      sent.set(fingerprint, now);

      const { error } = await db
        .from("site_errors")
        .insert({
          error_type: String(type || "javascript").slice(0, 80),
          message: safeMessage,
          technical_details: scrub(details || "").slice(0, 4000) || null,
          page_url: pageUrl.slice(0, 500),
          fingerprint,
          severity: severity || "error"
        });

      if (error) {
        originalConsoleError("Monitoring save failed:", error.message);
      }
    } catch (error) {
      originalConsoleError("Monitoring exception:", error);
    }
  }

  window.alponaReportError = reportError;

  window.addEventListener("error", function (event) {
    reportError(
      "javascript",
      event.message || "Unknown JavaScript error",
      "error",
      [
        event.error?.stack,
        event.filename && `Source: ${event.filename}:${event.lineno || 0}:${event.colno || 0}`
      ].filter(Boolean).join("\n")
    );
  });

  window.addEventListener("unhandledrejection", function (event) {
    const reason =
      event.reason?.message ||
      event.reason ||
      "Unhandled promise rejection";

    reportError(
      "promise",
      reason,
      "error",
      describe(event.reason)
    );
  });

  console.error = function (...args) {
    originalConsoleError(...args);

    const first = args[0];

    if (
      typeof first === "string" &&
      !first.startsWith("Monitoring ")
    ) {
      const details = args
        .slice(1)
        .map(describe)
        .filter(Boolean)
        .join("\n");

      reportError(
        "console",
        details ? `${first} ${details.split("\n")[0]}` : first,
        "warning",
        details
      );
    }
  };
})();
