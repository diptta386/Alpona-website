(function () {
  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
  let lastSnapshot = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function money(value) {
    return "৳" + Number(value || 0).toLocaleString();
  }

  async function ownerSession() {
    const { data, error } = await db.auth.getSession();

    if (
      error ||
      !data?.session?.user ||
      data.session.user.id !== OWNER_UID
    ) {
      throw new Error("Owner login required");
    }

    return data.session;
  }

  window.loadOwnerIntelligence = async function () {
    const health =
      document.getElementById("ownerHealthPanel");

    const reportList =
      document.getElementById("scheduledReportList");

    if (!health || !reportList) return;

    health.innerHTML =
      '<div class="analyticsLoading">Checking store health…</div>';

    reportList.innerHTML =
      '<div class="analyticsLoading">Loading reports…</div>';

    try {
      await ownerSession();

      const since24 =
        new Date(Date.now() - 24 * 60 * 60 * 1000)
          .toISOString();

      const [
        errorsResult,
        productsResult,
        ordersResult,
        bookingsResult,
        reportsResult
      ] = await Promise.all([
        db
          .from("site_errors")
          .select("*")
          .gte("created_at", since24)
          .order("created_at", { ascending: false })
          .limit(20),
        db
          .from("products")
          .select("id,name,stock,active")
          .eq("active", true),
        db
          .from("orders")
          .select("id,status,payment_status,created_at")
          .gte("created_at", since24),
        db
          .from("mehendi_bookings")
          .select("id,status,event_date,created_at")
          .order("event_date", { ascending: true }),
        db
          .from("owner_reports")
          .select("*")
          .order("generated_at", { ascending: false })
          .limit(12)
      ]);

      const foundError = [
        errorsResult,
        productsResult,
        ordersResult,
        bookingsResult,
        reportsResult
      ].find(x => x.error)?.error;

      if (foundError) throw foundError;

      const errors = errorsResult.data || [];
      const products = productsResult.data || [];
      const orders = ordersResult.data || [];
      const bookings = bookingsResult.data || [];
      const reports = reportsResult.data || [];

      const lowStock =
        products.filter(p => Number(p.stock || 0) <= 3);

      const pendingPayments =
        orders.filter(
          o => o.payment_status === "pending_verification"
        );

      const waitingBookings =
        bookings.filter(
          b => b.status === "Request Received"
        );

      const criticalErrors =
        errors.filter(
          e =>
            !e.resolved &&
            (e.severity === "critical" ||
             e.severity === "error")
        );

      const status =
        criticalErrors.length
          ? "Attention needed"
          : lowStock.length ||
            pendingPayments.length ||
            waitingBookings.length
          ? "Things to review"
          : "Healthy";

      health.innerHTML = `
        <div class="healthHeadline ${criticalErrors.length ? "needsAttention" : "healthy"}">
          <span>Store health</span>
          <b>${status}</b>
          <small>Last 24 hours</small>
        </div>

        <div class="healthGrid">
          <article>
            <span>Website errors</span>
            <b>${errors.length}</b>
            <small>${criticalErrors.length} unresolved error-level issues</small>
          </article>
          <article>
            <span>Low stock</span>
            <b>${lowStock.length}</b>
            <small>${lowStock.length ? lowStock.map(p => escapeHtml(p.name) + " (" + Number(p.stock || 0) + ")").join(", ") : "No products at 3 or fewer"}</small>
          </article>
          <article>
            <span>Payments waiting</span>
            <b>${pendingPayments.length}</b>
            <small>Pending verification in the last 24h</small>
          </article>
          <article>
            <span>Mehendi requests</span>
            <b>${waitingBookings.length}</b>
            <small>Waiting for contact</small>
          </article>
        </div>

        ${errors.length ? `
          <div class="recentErrors">
            <h4>Recent website issues</h4>
            ${errors.slice(0,8).map(e => `
              <div class="errorRow">
                <div>
                  <b>${escapeHtml(e.message)}</b>
                  <span>${escapeHtml(e.error_type)} · ${new Date(e.created_at).toLocaleString()}</span>
                </div>
                <button
                  class="secondary"
                  onclick="markSiteErrorResolved(${e.id})"
                  ${e.resolved ? "disabled" : ""}
                >${e.resolved ? "Resolved" : "Mark resolved"}</button>
              </div>
            `).join("")}
          </div>
        ` : ""}
      `;

      reportList.innerHTML = reports.length
        ? reports.map(r => {
            const m = r.metrics || {};
            return `
              <article class="scheduledReportCard">
                <div>
                  <span>${escapeHtml(r.report_type)} report</span>
                  <h4>${escapeHtml(r.period_start)} → ${escapeHtml(r.period_end)}</h4>
                  <p>${escapeHtml(r.summary)}</p>
                </div>
                <div class="reportMiniMetrics">
                  <span><b>${Number(m.orders || 0)}</b> orders</span>
                  <span><b>${money(m.revenue || 0)}</b> revenue</span>
                  <span><b>${Number(m.site_errors || 0)}</b> errors</span>
                </div>
              </article>
            `;
          }).join("")
        : '<div class="analyticsEmpty">Scheduled reports will appear here automatically.</div>';

    } catch (error) {
      console.error("Owner intelligence load error:", error);
      health.innerHTML =
        '<div class="analyticsEmpty">Could not load store health.</div>';
      reportList.innerHTML =
        '<div class="analyticsEmpty">Could not load reports.</div>';
    }
  };

  window.markSiteErrorResolved =
    async function (id) {

    const { error } = await db
      .from("site_errors")
      .update({ resolved: true })
      .eq("id", id);

    if (error) {
      console.error("Resolve site error failed:", error);
      alert("Could not mark this issue resolved.");
      return;
    }

    toast("Issue marked resolved");
    await window.loadOwnerIntelligence();
  };

  window.askAlponaOwnerAgent = async function (event) {
    event.preventDefault();

    const form = event.target;
    const input = form.elements["question"];
    const days = Number(
      document.getElementById("ownerAgentPeriod")?.value || 7
    );
    const output =
      document.getElementById("ownerAgentAnswer");
    const button =
      form.querySelector('button[type="submit"]');

    const question =
      String(input.value || "").trim();

    if (!question) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Analyzing…";
    }

    output.innerHTML =
      '<div class="analyticsLoading">Reviewing Alpona data…</div>';

    try {
      await ownerSession();

      const { data, error } =
        await db.functions.invoke(
          "owner-intelligence",
          {
            body: {
              question,
              days
            }
          }
        );

      if (error) throw error;
      if (!data?.success) {
        throw new Error(data?.error || "No response");
      }

      lastSnapshot = data.snapshot || null;

      output.innerHTML = `
        <div class="agentAnswer">
          <div class="agentMode">
            ${data.mode === "openai" ? "AI analysis" : "Smart store analysis"}
          </div>
          <p>${escapeHtml(data.answer).replace(/\n/g, "<br>")}</p>
        </div>
      `;

    } catch (error) {
      console.error("Owner agent error:", error);
      output.innerHTML =
        '<div class="analyticsEmpty">The owner assistant could not analyze the store right now.</div>';
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Ask Alpona";
      }
    }
  };

  window.exportOwnerReportCsv = function () {
    if (!lastSnapshot) {
      alert(
        "Ask the Alpona owner assistant a question first, then download the report."
      );
      return;
    }

    const rows = [
      ["Metric", "Value"],
      ["Period days", lastSnapshot.periodDays],
      ["Orders", lastSnapshot.orderCount],
      ["Revenue (BDT)", lastSnapshot.revenue],
      ["Units sold", lastSnapshot.unitsSold],
      ["Mehendi bookings", lastSnapshot.bookingCount],
      ["Upcoming Mehendi bookings", lastSnapshot.upcomingBookings],
      ["Recorded website errors", lastSnapshot.errors?.length || 0],
      ["Product views", lastSnapshot.eventCounts?.product_view || 0],
      ["Add to cart", lastSnapshot.eventCounts?.add_to_cart || 0],
      ["Checkout started", lastSnapshot.eventCounts?.checkout_started || 0]
    ];

    (lastSnapshot.topProducts || []).forEach((p, index) => {
      rows.push([
        "Top product #" + (index + 1),
        p.product_name + " — " + p.units + " units"
      ]);
    });

    const csv = rows
      .map(row =>
        row
          .map(value =>
            '"' +
            String(value ?? "").replace(/"/g, '""') +
            '"'
          )
          .join(",")
      )
      .join("\n");

    const blob =
      new Blob([csv], {
        type: "text/csv;charset=utf-8"
      });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download =
      "alpona-owner-report-" +
      new Date().toISOString().slice(0,10) +
      ".csv";

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
})();