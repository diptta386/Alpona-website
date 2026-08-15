(function () {

  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";

  async function ownerSignIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      alert("Owner login failed: " + error.message);
      return false;
    }

    if (!data.user || data.user.id !== OWNER_UID) {
      await db.auth.signOut();
      alert("This account is not authorized as the Alpona owner.");
      return false;
    }

    sessionStorage.setItem("alpona_admin", "yes");
    return true;
  }

  async function ownerSignOut() {
    await db.auth.signOut();
    sessionStorage.removeItem("alpona_admin");
    closeAdmin();
  }

  async function loadSupabaseOrders() {
    const { data, error } = await db
      .from("orders")
      .select(`
        *,
        order_items (
          id,
          product_id,
          product_name,
          quantity,
          price,
          cost
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      alert("Could not load orders.");
      return [];
    }

    return data || [];
  }

  async function updateSupabaseOrderStatus(id, status) {
    const { error } = await db
      .from("orders")
      .update({ status })
      .eq("id", id);

    if (error) {
      alert("Could not update order.");
      console.error(error);
      return;
    }

    await renderSupabaseAdmin();
  }

  async function loadSupabaseExpenses() {
    const { data, error } = await db
      .from("expenses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return [];
    }

    return data || [];
  }

  async function addSupabaseExpense(description, amount) {
    const { error } = await db
      .from("expenses")
      .insert({
        description,
        amount: Number(amount)
      });

    if (error) {
      alert("Could not save expense.");
      console.error(error);
      return;
    }

    await renderSupabaseAdmin();
  }

  async function deleteSupabaseExpense(id) {
    const { error } = await db
      .from("expenses")
      .delete()
      .eq("id", id);

    if (error) {
      alert("Could not delete expense.");
      console.error(error);
      return;
    }

    await renderSupabaseAdmin();
  }

  async function renderSupabaseAdmin() {
    const orders = await loadSupabaseOrders();
    const expenses = await loadSupabaseExpenses();

    const activeOrders = orders.filter(o => o.status !== "Cancelled");

    const sales = activeOrders.reduce(
      (sum, o) => sum + Number(o.total || 0),
      0
    );

    const productCosts = activeOrders.reduce((sum, o) => {
      const items = o.order_items || [];
      return sum + items.reduce(
        (s, i) => s + Number(i.cost || 0) * Number(i.quantity || 0),
        0
      );
    }, 0);

    const expenseTotal = expenses.reduce(
      (sum, e) => sum + Number(e.amount || 0),
      0
    );

    document.getElementById("statSales").textContent = money(sales);
    document.getElementById("statOrders").textContent = orders.length;
    document.getElementById("statExpenses").textContent = money(expenseTotal);
    document.getElementById("statProfit").textContent =
      money(sales - productCosts - expenseTotal);

    document.getElementById("tab-orders").innerHTML =
      orders.length
        ? `
        <div class="panelHead">
          <h3>All Orders</h3>
        </div>

        <table class="adminTable">
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
          </tr>

          ${orders.map(o => `
            <tr>
              <td>
                <b>${o.order_number}</b><br>
                <span class="muted">
                  ${new Date(o.created_at).toLocaleString()}
                </span>
              </td>

              <td>
                ${o.customer_name}<br>
                ${o.phone}<br>
                <span class="muted">
                  ${o.address}
                </span>
              </td>

              <td>
                ${(o.order_items || []).map(i =>
                  `${i.product_name} × ${i.quantity}`
                ).join("<br>")}
              </td>

              <td>${money(o.total)}</td>

             <td>

  <b>Method:</b> ${o.advance_method || o.payment_method || ""}
  <br>

  <b>Transaction:</b> ${o.advance_transaction_id || "N/A"}
  <br>

  <b>Paid:</b> ${money(o.advance_amount || 0)}
  <br>

  <b>Remaining COD:</b> ${money(o.remaining_cod || 0)}
  <br>

  <b>Payment Status:</b> ${o.payment_status || "pending_verification"}

  <br><br>

  ${
    o.payment_status === "pending_verification"
      ? `
        <button
          class="primary"
          onclick="verifyPayment(${o.id})"
        >
          Verify Payment
        </button>

        <button
          class="danger"
          onclick="rejectPayment(${o.id})"
        >
          Reject Payment
        </button>
      `
      : ""
  }
${(
  o.payment_status === "verified" &&
  Number(o.remaining_cod || 0) > 0
) ? `
  <br><br>

  <button
    class="primary"
    onclick="markCodReceived(${o.id}, ${Number(o.remaining_cod || 0)})"
  >
    Mark COD Received
  </button>
` : ""}
</td>

              <td>
                <select
                  class="statusSelect"
                  onchange="updateSupabaseOrderStatus(${o.id}, this.value)"
                >
                  ${[
                    "New",
                    "Confirmed",
                    "Processing",
                    "Shipped",
                    "Delivered",
                    "Cancelled"
                  ].map(s =>
                    `<option ${o.status === s ? "selected" : ""}>${s}</option>`
                  ).join("")}
                </select>
              </td>
            </tr>
          `).join("")}
        </table>
        `
        : "<p>No orders yet.</p>";

    document.getElementById("expenseList").innerHTML =
      expenses.length
        ? `
        <table class="adminTable">
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th></th>
          </tr>

          ${expenses.map(e => `
            <tr>
              <td>${new Date(e.created_at).toLocaleDateString()}</td>
              <td>${e.description}</td>
              <td>${money(e.amount)}</td>
              <td>
                <button
                  class="danger"
                  onclick="deleteSupabaseExpense(${e.id})"
                >
                  Delete
                </button>
              </td>
            </tr>
          `).join("")}
        </table>
        `
        : "<p>No expenses entered yet.</p>";
  }

  const oldAdminLogin = window.adminLogin;

  window.adminLogin = async function (event) {
    event.preventDefault();

   const email =
  document.getElementById("ownerEmail").value.trim();

if (!email) return;

    const password =
      document.getElementById("ownerPassword").value;

    const ok = await ownerSignIn(email, password);

    if (!ok) return;

    closeModal("loginModal");
    openAdmin();
    await renderSupabaseAdmin();
  };

  window.adminLogout = ownerSignOut;
  window.updateSupabaseOrderStatus = updateSupabaseOrderStatus;
  window.deleteSupabaseExpense = deleteSupabaseExpense;

  window.saveExpense = async function (event) {
    event.preventDefault();

    const fd = new FormData(event.target);

    await addSupabaseExpense(
      fd.get("description"),
      fd.get("amount")
    );

    event.target.reset();
    closeModal("expenseModal");
  };

  const oldOpenAdmin = window.openAdmin;

  window.openAdmin = function () {
    oldOpenAdmin();
    renderSupabaseAdmin();
  };
window.verifyPayment = async function(id) {

  try {

    // 1. Get the order details first
    const { data: order, error: orderError } = await db
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_email,
        total,
        remaining_cod,
        payment_status
      `)
      .eq("id", id)
      .single();

    if (orderError) {
      throw orderError;
    }

    if (!order.customer_email) {
      alert("This order has no customer email.");
      return;
    }

    // 2. Mark payment verified
    const { error: verifyError } = await db
      .from("orders")
      .update({
        payment_status: "verified",
        status: "Confirmed"
      })
      .eq("id", id);

    if (verifyError) {
      throw verifyError;
    }

    // 3. Send confirmation email
    const { data: emailData, error: emailError } =
      await db.functions.invoke(
        "send-order-confirmation",
        {
          body: {
            customer_email: order.customer_email,
            customer_name: order.customer_name,
            order_number: order.order_number,
            total: order.total,
            remaining_cod: order.remaining_cod
          }
        }
      );

    if (emailError) {
      console.error("Email error:", emailError);

      alert(
        "Payment was verified, but the confirmation email could not be sent."
      );

      await renderSupabaseAdmin();
      return;
    }

    console.log("Email sent:", emailData);

    alert(
      "Payment verified.\n\n" +
      "Order confirmed and confirmation email sent to:\n" +
      order.customer_email
    );

    await renderSupabaseAdmin();

  } catch (error) {

    console.error(
      "Verify payment error:",
      error
    );

    alert(
      "Could not verify the payment."
    );

  }

};
})();
