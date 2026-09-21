(function () {
  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
  const SESSION_KEY = "alpona_analytics_session";

  function getAnalyticsSessionId() {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        "alp_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 10);
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  }

  window.alponaTrack = async function (eventType, details = {}) {
    try {
      const record = {
        event_type: eventType,
        product_id:
          details.product_id === undefined ||
          details.product_id === null
            ? null
            : Number(details.product_id),
        product_name: details.product_name || null,
        quantity: Math.max(1, Number(details.quantity || 1)),
        value: Number(details.value || 0),
        session_id: getAnalyticsSessionId()
      };

      const { error } = await db
        .from("analytics_events")
        .insert(record);

      if (error) {
        console.warn("Alpona analytics event was not saved:", error);
      }
    } catch (error) {
      console.warn("Alpona analytics tracking error:", error);
    }
  };

  function periodStart(days) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - (days - 1));
    return d;
  }

  function safeMoney(value) {
    return "৳" + Number(value || 0).toLocaleString();
  }

  function safePercent(value) {
    if (!Number.isFinite(value)) return "0%";
    return Math.round(value) + "%";
  }

  function getTop(rows, field) {
    if (!rows.length) return null;
    return [...rows].sort(
      (a, b) => Number(b[field] || 0) - Number(a[field] || 0)
    )[0];
  }

  function aggregateEngagement(events) {
    const map = new Map();

    (events || []).forEach((event) => {
      if (!event.product_id && !event.product_name) return;

      const key =
        event.product_id !== null && event.product_id !== undefined
          ? String(event.product_id)
          : "name:" + event.product_name;

      if (!map.has(key)) {
        map.set(key, {
          product_id: event.product_id,
          product_name: event.product_name || "Unknown product",
          views: 0,
          added: 0,
          checkout: 0,
          eventPurchases: 0
        });
      }

      const row = map.get(key);
      if (event.product_name) row.product_name = event.product_name;

      if (event.event_type === "product_view") {
        row.views += Number(event.quantity || 1);
      } else if (event.event_type === "add_to_cart") {
        row.added += Number(event.quantity || 1);
      } else if (event.event_type === "checkout_started") {
        row.checkout += Number(event.quantity || 1);
      } else if (event.event_type === "product_purchased") {
        row.eventPurchases += Number(event.quantity || 1);
      }
    });

    return map;
  }

  function aggregateSales(orders) {
    const map = new Map();

    (orders || []).forEach((order) => {
      if (order.status === "Cancelled") return;

      (order.order_items || []).forEach((item) => {
        const key =
          item.product_id !== null && item.product_id !== undefined
            ? String(item.product_id)
            : "name:" + item.product_name;

        if (!map.has(key)) {
          map.set(key, {
            product_id: item.product_id,
            product_name: item.product_name || "Unknown product",
            sold: 0,
            productRevenue: 0
          });
        }

        const row = map.get(key);
        row.sold += Number(item.quantity || 0);
        row.productRevenue +=
          Number(item.price || 0) * Number(item.quantity || 0);
      });
    });

    return map;
  }

  function mergeProductMetrics(engagement, sales) {
    const keys = new Set([
      ...engagement.keys(),
      ...sales.keys()
    ]);

    return [...keys].map((key) => {
      const e = engagement.get(key) || {};
      const s = sales.get(key) || {};

      const row = {
        product_id:
          e.product_id !== undefined ? e.product_id : s.product_id,
        product_name:
          e.product_name || s.product_name || "Unknown product",
        views: Number(e.views || 0),
        added: Number(e.added || 0),
        checkout: Number(e.checkout || 0),
        sold: Number(s.sold || 0),
        productRevenue: Number(s.productRevenue || 0)
      };

      row.addRate =
        row.views > 0 ? (row.added / row.views) * 100 : 0;

      row.purchaseRate =
        row.checkout > 0 ? (row.sold / row.checkout) * 100 : 0;

      return row;
    });
  }

  function buildDailySeries(events, orders, start, days) {
    const rows = [];

    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);

      rows.push({
        key,
        label: d.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric"
        }),
        views: 0,
        added: 0,
        checkout: 0,
        orders: 0,
        revenue: 0
      });
    }

    const byDate = new Map(rows.map((r) => [r.key, r]));

    (events || []).forEach((event) => {
      const key = String(event.created_at || "").slice(0, 10);
      const row = byDate.get(key);
      if (!row) return;

      if (event.event_type === "product_view") {
        row.views += Number(event.quantity || 1);
      } else if (event.event_type === "add_to_cart") {
        row.added += Number(event.quantity || 1);
      } else if (event.event_type === "checkout_started") {
        row.checkout += Number(event.quantity || 1);
      }
    });

    (orders || []).forEach((order) => {
      if (order.status === "Cancelled") return;
      const key = String(order.created_at || "").slice(0, 10);
      const row = byDate.get(key);
      if (!row) return;

      row.orders += 1;
      row.revenue += Number(order.total || 0);
    });

    return rows;
  }

  function renderTrendChart(rows) {
    const max = Math.max(
      1,
      ...rows.map((r) => Math.max(r.views, r.added, r.checkout))
    );

    return `
      <div class="analyticsChartLegend">
        <span><i class="legendDot views"></i>Views</span>
        <span><i class="legendDot added"></i>Add to cart</span>
        <span><i class="legendDot checkout"></i>Checkout</span>
      </div>
      <div class="analyticsChart">
        ${rows.map((r) => `
          <div class="analyticsDay" title="${r.label}: ${r.views} views, ${r.added} added, ${r.checkout} checkout">
            <div class="analyticsBars">
              <span class="bar views" style="height:${Math.max(3,(r.views/max)*100)}%"></span>
              <span class="bar added" style="height:${Math.max(3,(r.added/max)*100)}%"></span>
              <span class="bar checkout" style="height:${Math.max(3,(r.checkout/max)*100)}%"></span>
            </div>
            <small>${r.label}</small>
          </div>
        `).join("")}
      </div>
    `;
  }

  window.loadAnalyticsDashboard = async function (days) {
    const container = document.getElementById("analyticsDashboard");
    if (!container) return;

    const requestedDays =
      Number(days || document.getElementById("analyticsPeriod")?.value || 7);

    const periodSelect = document.getElementById("analyticsPeriod");
    if (periodSelect) periodSelect.value = String(requestedDays);

    container.innerHTML =
      '<div class="analyticsLoading">Loading your store report…</div>';

    try {
      const {
        data: sessionData,
        error: sessionError
      } = await db.auth.getSession();

      if (
        sessionError ||
        !sessionData?.session?.user ||
        sessionData.session.user.id !== OWNER_UID
      ) {
        container.innerHTML =
          '<div class="analyticsEmpty">Owner login is required to view reports.</div>';
        return;
      }

      const start = periodStart(requestedDays);
      const startIso = start.toISOString();

      const [eventsResult, ordersResult] = await Promise.all([
        db
          .from("analytics_events")
          .select("event_type,product_id,product_name,quantity,value,created_at")
          .gte("created_at", startIso)
          .order("created_at", { ascending: true }),
        db
          .from("orders")
          .select(`
            id,
            order_number,
            total,
            status,
            created_at,
            order_items (
              product_id,
              product_name,
              quantity,
              price
            )
          `)
          .gte("created_at", startIso)
          .order("created_at", { ascending: true })
      ]);

      if (eventsResult.error) {
        throw eventsResult.error;
      }

      if (ordersResult.error) {
        throw ordersResult.error;
      }

      const events = eventsResult.data || [];
      const orders = ordersResult.data || [];

      const activeOrders = orders.filter(
        (o) => o.status !== "Cancelled"
      );

      const engagement = aggregateEngagement(events);
      const sales = aggregateSales(activeOrders);
      const products = mergeProductMetrics(engagement, sales);

      const revenue = activeOrders.reduce(
        (sum, order) => sum + Number(order.total || 0),
        0
      );

      const unitsSold = products.reduce(
        (sum, p) => sum + p.sold,
        0
      );

      const checkoutEvents = events.filter(
        (e) => e.event_type === "checkout_started"
      );

      const uniqueCheckoutSessions = new Set(
        checkoutEvents.map((e) => e.session_id).filter(Boolean)
      ).size;

      const bestSeller = getTop(products, "sold");
      const mostAdded = getTop(products, "added");
      const mostViewed = getTop(products, "views");

      const rows = [...products].sort((a, b) => {
        if (b.sold !== a.sold) return b.sold - a.sold;
        if (b.added !== a.added) return b.added - a.added;
        return b.views - a.views;
      });

      const daily = buildDailySeries(
        events,
        activeOrders,
        start,
        requestedDays
      );

      const rangeLabel =
        requestedDays === 7
          ? "Last 7 days"
          : requestedDays === 30
          ? "Last 30 days"
          : "Last 90 days";

      container.innerHTML = `
        <div class="analyticsReportHeader">
          <div>
            <span class="analyticsRange">${rangeLabel}</span>
            <h3>Store performance</h3>
          </div>
          <button class="secondary" onclick="loadAnalyticsDashboard()">Refresh</button>
        </div>

        <div class="analyticsKpis">
          <article>
            <span>Revenue</span>
            <b>${safeMoney(revenue)}</b>
            <small>Non-cancelled orders</small>
          </article>
          <article>
            <span>Orders</span>
            <b>${activeOrders.length.toLocaleString()}</b>
            <small>${unitsSold.toLocaleString()} item${unitsSold === 1 ? "" : "s"} sold</small>
          </article>
          <article>
            <span>Checkout activity</span>
            <b>${checkoutEvents.reduce((s,e)=>s+Number(e.quantity||1),0).toLocaleString()}</b>
            <small>${uniqueCheckoutSessions.toLocaleString()} shopper session${uniqueCheckoutSessions === 1 ? "" : "s"}</small>
          </article>
          <article>
            <span>Best seller</span>
            <b class="analyticsProductKpi">${bestSeller && bestSeller.sold > 0 ? bestSeller.product_name : "No sales yet"}</b>
            <small>${bestSeller && bestSeller.sold > 0 ? bestSeller.sold + " sold" : "Waiting for sales data"}</small>
          </article>
        </div>

        <div class="analyticsHighlights">
          <div>
            <span>Most viewed</span>
            <b>${mostViewed && mostViewed.views > 0 ? mostViewed.product_name : "No view data yet"}</b>
            <small>${mostViewed ? mostViewed.views : 0} views</small>
          </div>
          <div>
            <span>Most added to cart</span>
            <b>${mostAdded && mostAdded.added > 0 ? mostAdded.product_name : "No cart data yet"}</b>
            <small>${mostAdded ? mostAdded.added : 0} adds</small>
          </div>
          <div>
            <span>Store conversion</span>
            <b>${safePercent(
              checkoutEvents.length > 0
                ? (activeOrders.length / Math.max(1, uniqueCheckoutSessions || checkoutEvents.length)) * 100
                : 0
            )}</b>
            <small>Orders ÷ checkout sessions</small>
          </div>
        </div>

        <section class="analyticsPanel">
          <div class="analyticsPanelHead">
            <div>
              <span>Engagement trend</span>
              <h4>What shoppers are doing</h4>
            </div>
          </div>
          ${renderTrendChart(daily)}
        </section>

        <section class="analyticsPanel">
          <div class="analyticsPanelHead">
            <div>
              <span>Product report</span>
              <h4>Popularity and sales</h4>
            </div>
          </div>

          ${rows.length ? `
            <div class="analyticsTableWrap">
              <table class="adminTable analyticsTable">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Views</th>
                    <th>Added</th>
                    <th>Checkout</th>
                    <th>Sold</th>
                    <th>Product revenue</th>
                    <th>View → Cart</th>
                    <th>Checkout → Sale</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows.map((p) => `
                    <tr>
                      <td><b>${p.product_name}</b></td>
                      <td>${p.views}</td>
                      <td>${p.added}</td>
                      <td>${p.checkout}</td>
                      <td><b>${p.sold}</b></td>
                      <td>${safeMoney(p.productRevenue)}</td>
                      <td>${safePercent(p.addRate)}</td>
                      <td>${safePercent(p.purchaseRate)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          ` : '<div class="analyticsEmpty">No activity in this period yet.</div>'}
        </section>

        <p class="analyticsNote">
          Sales come from your real Supabase orders. Views, add-to-cart and checkout tracking are first-party Alpona analytics and begin collecting after this dashboard upgrade.
        </p>
      `;

    } catch (error) {
      console.error("Analytics dashboard error:", error);
      container.innerHTML =
        '<div class="analyticsEmpty">Could not load analytics right now. Please refresh the report.</div>';
    }
  };
})();