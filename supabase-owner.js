(function () {

  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let pendingMfaFactorId = null;

  function showMfaModal(mode, enrollment) {
    const modal = document.getElementById("mfaModal");
    const title = document.getElementById("mfaTitle");
    const text = document.getElementById("mfaText");
    const setup = document.getElementById("mfaSetup");
    const qr = document.getElementById("mfaQr");
    const secret = document.getElementById("mfaSecret");
    const input = document.getElementById("mfaCode");

    if (!modal) return;

    input.value = "";

    if (mode === "enroll" && enrollment) {
      title.textContent = "Secure Owner Account";
      text.textContent =
        "Scan this QR code with Google Authenticator, Authy, 1Password, or another authenticator app. Then enter the 6-digit code.";
      setup.style.display = "block";
      qr.src = enrollment.totp.qr_code;
      secret.textContent = enrollment.totp.secret;
    } else {
      title.textContent = "Two-Step Verification";
      text.textContent =
        "Enter the current 6-digit code from your authenticator app.";
      setup.style.display = "none";
      qr.removeAttribute("src");
      secret.textContent = "";
    }

    modal.classList.add("show");
    setTimeout(() => input.focus(), 50);
  }

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

    const factors = await db.auth.mfa.listFactors();

    if (factors.error) {
      await db.auth.signOut();
      alert("Could not check owner two-step verification.");
      return false;
    }

    const verifiedTotp =
      (factors.data?.totp || []).find(
        factor => factor.status === "verified"
      );

    if (verifiedTotp) {
      pendingMfaFactorId = verifiedTotp.id;
      closeModal("loginModal");
      showMfaModal("verify");
      return "mfa_required";
    }

    const enroll = await db.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Alpona Owner " + Date.now()
    });

    if (enroll.error || !enroll.data) {
      await db.auth.signOut();
      alert(
        "Could not start authenticator setup: " +
        (enroll.error?.message || "Unknown error")
      );
      return false;
    }

    pendingMfaFactorId = enroll.data.id;
    closeModal("loginModal");
    showMfaModal("enroll", enroll.data);
    return "mfa_enroll";
  }

  window.verifyOwnerMfa = async function (event) {
    event.preventDefault();

    const input =
      document.getElementById("mfaCode");

    const code =
      String(input.value || "")
        .replace(/[^0-9]/g, "")
        .slice(0, 6);

    input.value = code;

    if (code.length !== 6) {
      alert("Enter all 6 digits from your authenticator app.");
      return;
    }

    if (!pendingMfaFactorId) {
      alert("Please sign in again.");
      await db.auth.signOut();
      closeModal("mfaModal");
      return;
    }

    const challenge = await db.auth.mfa.challenge({
      factorId: pendingMfaFactorId
    });

    if (challenge.error || !challenge.data?.id) {
      alert(
        "Could not start two-step verification: " +
        (challenge.error?.message || "Unknown error")
      );
      return;
    }

    const verify = await db.auth.mfa.verify({
      factorId: pendingMfaFactorId,
      challengeId: challenge.data.id,
      code
    });

    if (verify.error) {
      alert("Incorrect authenticator code. Please try again.");
      return;
    }

    const aal =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      aal.error ||
      aal.data?.currentLevel !== "aal2"
    ) {
      alert("Two-step verification could not be confirmed.");
      return;
    }

    sessionStorage.setItem("alpona_admin", "yes");
    pendingMfaFactorId = null;
    closeModal("mfaModal");
    openAdmin();
    await renderSupabaseAdmin();
  };

  window.cancelOwnerMfa = async function () {
    pendingMfaFactorId = null;
    sessionStorage.removeItem("alpona_admin");
    await db.auth.signOut();
    closeModal("mfaModal");
  };

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

  try {

    const { data: order, error: orderError } = await db
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_email,
        status
      `)
      .eq("id", id)
      .single();

    if (orderError) {
      throw orderError;
    }

    const { error: updateError } = await db
      .from("orders")
      .update({ status })
      .eq("id", id);

    if (updateError) {
      throw updateError;
    }

    if (
      status === "Shipped" &&
      order.customer_email
    ) {

      const { error: emailError } =
        await db.functions.invoke(
          "send-shipped-email",
          {
            body: {
              customer_email: order.customer_email,
              customer_name: order.customer_name,
              order_number: order.order_number
            }
          }
        );

      if (emailError) {
        console.error(
          "Shipped email error:",
          emailError
        );

        alert(
          "Order was marked Shipped, but the email could not be sent."
        );
      } else {
        alert(
          "Order marked Shipped and customer email sent."
        );
      }

    }
// SEND DELIVERED EMAIL
    if (
      status === "Delivered" &&
      order.customer_email
    ) {

      const { error: deliveredEmailError } =
        await db.functions.invoke(
          "send-delivered-email",
          {
            body: {
              customer_email: order.customer_email,
              customer_name: order.customer_name,
              order_number: order.order_number
            }
          }
        );

      if (deliveredEmailError) {

        console.error(
          "Delivered email error:",
          deliveredEmailError
        );

        alert(
          "Order was marked Delivered, but the delivery email could not be sent."
        );

      } else {

        alert(
          "Order marked Delivered and customer email sent."
        );

      }

    }

// SEND CANCELLED EMAIL
if (
  status === "Cancelled" &&
  order.customer_email
) {

  const { error: cancelledEmailError } =
    await db.functions.invoke(
      "send-cancelled-email",
      {
        body: {
          customer_email: order.customer_email,
          customer_name: order.customer_name,
          order_number: order.order_number
        }
      }
    );

  if (cancelledEmailError) {

    console.error(
      "Cancelled email error:",
      cancelledEmailError
    );

    alert(
      "Order was cancelled, but the cancellation email could not be sent."
    );

  } else {

    alert(
      "Order cancelled and customer email sent."
    );

  }

}
    await renderSupabaseAdmin();
   

  } catch (error) {

    console.error(
      "Order status update error:",
      error
    );

    alert(
      "Could not update order status."
    );

  }

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

<div style="margin-bottom:15px; display:flex; gap:8px; flex-wrap:wrap;">

  <button class="secondary" onclick="filterOrders('all')">
    All
  </button>

  <button class="secondary" onclick="filterOrders('Pending Payment')">
    Pending Payment
  </button>

  <button class="secondary" onclick="filterOrders('Confirmed')">
    Confirmed
  </button>

  <button class="secondary" onclick="filterOrders('Processing')">
    Processing
  </button>

  <button class="secondary" onclick="filterOrders('Shipped')">
    Shipped
  </button>

  <button class="secondary" onclick="filterOrders('Delivered')">
    Delivered
  </button>

  <button class="secondary" onclick="filterOrders('Cancelled')">
    Cancelled
  </button>

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
            <tr data-order-status="${o.status}">
              <td>
                <b>${escapeHtml(o.order_number)}</b><br>
                <span class="muted">
                  ${new Date(o.created_at).toLocaleString()}
                </span>
              </td>

              <td>
                ${escapeHtml(o.customer_name)}<br>
                ${escapeHtml(o.phone)}<br>
                <span class="muted">
                  ${escapeHtml(o.address)}
                </span>
              </td>

              <td>
                ${(o.order_items || []).map(i =>
                  `${escapeHtml(i.product_name)} × ${Number(i.quantity || 0)}`
                ).join("<br>")}
              </td>

              <td>
                ${money(o.total)}
                ${o.delivery_speed === "express" ? `
                  <br><span class="expressOrderBadge">EXPRESS</span>
                  <br><span class="muted">Rush fee: ${money(o.express_fee || 0)} · Dispatch within 1 business day</span>
                ` : '<br><span class="muted">Standard delivery</span>'}
              </td>

             <td>

  <b>Method:</b> ${escapeHtml(o.advance_method || o.payment_method || "")}
  <br>

  <b>Transaction:</b> ${escapeHtml(o.advance_transaction_id || "N/A")}
  <br>

  <b>Paid:</b> ${money(o.advance_amount || 0)}
  <br>

  <b>Remaining COD:</b> ${money(o.remaining_cod || 0)}
  <br>

  <b>Payment Status:</b> ${escapeHtml(o.payment_status || "pending_verification")}

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
${(
  o.payment_status === "verified" &&
  !o.pathao_consignment_id
) ? `
  <br><br>

  <button
    class="primary"
    onclick="createPathaoDelivery(${o.id})"
  >
    Create Pathao Delivery
  </button>
` : ""}

${o.pathao_consignment_id ? `
  <br><br>

  <b>Courier:</b> Pathao
  <br>

  <b>Consignment:</b>
  ${escapeHtml(o.pathao_consignment_id)}
  <br>

  <b>Pathao Status:</b>
  ${escapeHtml(o.pathao_status || "Pending")}
  <br>

  <b>Pathao Fee:</b>
  ৳${Number(o.pathao_delivery_fee || 0)}
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
              <td>${escapeHtml(e.description)}</td>
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

    const result = await ownerSignIn(email, password);

    if (!result) return;

    // MFA flow now opens the dashboard only after AAL2 verification.
    if (
      result === "mfa_required" ||
      result === "mfa_enroll"
    ) {
      return;
    }
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

  window.openAdmin = async function () {
    const { data: sessionData } =
      await db.auth.getSession();

    const user = sessionData?.session?.user;

    if (!user || user.id !== OWNER_UID) {
      sessionStorage.removeItem("alpona_admin");
      showAdminLogin();
      return;
    }

    const aal =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      aal.error ||
      aal.data?.currentLevel !== "aal2"
    ) {
      sessionStorage.removeItem("alpona_admin");

      const factors = await db.auth.mfa.listFactors();
      const verifiedTotp =
        (factors.data?.totp || []).find(
          factor => factor.status === "verified"
        );

      if (verifiedTotp) {
        pendingMfaFactorId = verifiedTotp.id;
        showMfaModal("verify");
      } else {
        alert(
          "Owner two-step verification must be configured before opening the dashboard."
        );
        await db.auth.signOut();
        showAdminLogin();
      }

      return;
    }

    oldOpenAdmin();
    renderSupabaseAdmin();
  };
 window.createPathaoDelivery = async function(id) {

  try {

    // ==========================================
    // LOAD THE REAL ALPONA ORDER
    // ==========================================

    const {
      data: order,
      error: orderError
    } = await db
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        phone,
        address,
        status,
        payment_status,
        remaining_cod,
        total,
        delivery_speed,
        express_fee,
        pathao_city_name,
        pathao_zone_name,
        pathao_area_name,
        pathao_consignment_id,
        order_items (
          product_name,
          quantity
        )
      `)
      .eq("id", id)
      .single();


    if (orderError || !order) {

      console.error(
        "Could not load order:",
        orderError
      );

      alert(
        "Could not load this Alpona order."
      );

      return;
    }


    // ==========================================
    // SAFETY CHECKS
    // ==========================================

    if (
      order.payment_status !== "verified" &&
      order.payment_status !== "fully_paid"
    ) {

      alert(
        "Payment must be verified before creating a Pathao delivery."
      );

      return;
    }


    if (order.status === "Cancelled") {

      alert(
        "A cancelled order cannot be sent to Pathao."
      );

      return;
    }


    if (order.pathao_consignment_id) {

      alert(
        "This order already has a Pathao delivery.\n\n" +
        "Consignment ID: " +
        order.pathao_consignment_id
      );

      return;
    }


    if (
      !order.customer_name ||
      !order.phone ||
      !order.address
    ) {

      alert(
        "Customer name, phone and address are required."
      );

      return;
    }


    // ==========================================
    // PRODUCT SUMMARY
    // ==========================================

    const productsSummary =
      (order.order_items || [])
        .map(
          item =>
            item.product_name +
            " × " +
            Number(item.quantity || 0)
        )
        .join("\n");


    // ==========================================
    // FINAL LIVE PATHAO CONFIRMATION
    // ==========================================

    const confirmed = confirm(

      "CREATE REAL PATHAO DELIVERY?\n\n" +

      "Order: " +
      order.order_number +
      "\n\n" +

      "Customer: " +
      order.customer_name +
      "\n" +

      "Phone: " +
      order.phone +
      "\n\n" +

      "Address:\n" +
      order.address +
      "\n\n" +

      "City: " +
      (order.pathao_city_name || "N/A") +
      "\n" +

      "Zone: " +
      (order.pathao_zone_name || "N/A") +
      "\n" +

      "Area: " +
      (order.pathao_area_name || "N/A") +
      "\n\n" +

      "Products:\n" +
      (productsSummary || "Alpona order") +
      "\n\n" +

      "Remaining COD: " +
      money(
        Number(order.remaining_cod || 0)
      ) +
      "\n\n" +

      "Total Order: " +
      money(
        Number(order.total || 0)
      ) +
      "\n\n" +

      "Delivery: " +
      (order.delivery_speed === "express"
        ? "EXPRESS — dispatch within 1 business day"
        : "Standard") +
      "\n\n" +

      "Parcel weight will be calculated automatically from the products.\n\n" +

      "IMPORTANT:\n" +
      "Press OK only if this parcel is packed and ready for Pathao pickup."

    );


    if (!confirmed) {
      return;
    }


    // ==========================================
    // CREATE REAL PATHAO DELIVERY
    // ==========================================

    const {
      data,
      error
    } = await db.functions.invoke(
      "pathao-create-order",
      {
        body: {
          order_id: id
        }
      }
    );


    if (error) {

      console.error(
        "Pathao function error:",
        error
      );

      alert(
        "Could not create Pathao delivery.\n\n" +
        (error.message || "Unknown error")
      );

      return;
    }


    if (
      !data ||
      data.success !== true
    ) {

      console.error(
        "Pathao response:",
        data
      );

      alert(
        data?.error ||
        "Pathao delivery could not be created."
      );

      return;
    }


    // ==========================================
    // SUCCESS
    // ==========================================

    alert(

      "PATHAO DELIVERY CREATED SUCCESSFULLY!\n\n" +

      "Order: " +
      order.order_number +
      "\n\n" +

      "Consignment ID: " +
      (data.consignment_id || "N/A") +
      "\n" +

      "Pathao Status: " +
      (data.status || "Pending") +
      "\n" +

      "Pathao Delivery Fee: ৳" +
      Number(data.delivery_fee || 0) +
      "\n" +

      "Parcel Weight: " +
      Number(data.item_weight || 0) +
      " KG\n\n" +

      "COD to Collect: ৳" +
      Number(data.amount_to_collect || 0)

    );


    await renderSupabaseAdmin();


  } catch (error) {

    console.error(
      "Create Pathao delivery error:",
      error
    );

    alert(
      "Could not create Pathao delivery."
    );

  }

};
  
window.verifyPayment = async function(id) {
  try {

    // 1. Load order + ordered products
    const { data: order, error: orderError } = await db
      .from("orders")
      .select(`
        id,
        order_number,
        customer_name,
        customer_email,
        total,
        remaining_cod,
        delivery_speed,
        express_fee,
        payment_status,
        stock_reduced,
        order_items (
          product_id,
          product_name,
          quantity
        )
      `)
      .eq("id", id)
      .single();

    if (orderError) {
      throw orderError;
    }


    // 2. Check customer email
    if (!order.customer_email) {
      alert("This order has no customer email.");
      return;
    }


    // 3. Reduce stock ONLY if it was not reduced before
    if (order.stock_reduced !== true) {

      const items = order.order_items || [];

      // First check that enough stock exists
      for (const item of items) {

        if (!item.product_id) continue;

        const { data: product, error: productError } = await db
          .from("products")
          .select("id, name, stock")
          .eq("id", item.product_id)
          .single();

        if (productError) {
          throw productError;
        }

        const currentStock =
          Number(product.stock || 0);

        const orderedQty =
          Number(item.quantity || 0);

        if (currentStock < orderedQty) {

          alert(
            "Not enough stock for " +
            (product.name || item.product_name) +
            ".\n\nAvailable: " +
            currentStock +
            "\nOrdered: " +
            orderedQty
          );

          return;
        }

      }


      // Now reduce stock
      for (const item of items) {

        if (!item.product_id) continue;

        const { data: product, error: productError } = await db
          .from("products")
          .select("stock")
          .eq("id", item.product_id)
          .single();

        if (productError) {
          throw productError;
        }

        const newStock =
          Number(product.stock || 0) -
          Number(item.quantity || 0);

        const { error: stockError } = await db
          .from("products")
          .update({
            stock: newStock
          })
          .eq("id", item.product_id);

        if (stockError) {
          throw stockError;
        }

      }

    }


    // 4. Verify payment and remember stock was reduced
    const { error: verifyError } = await db
      .from("orders")
      .update({
        payment_status: "verified",
        status: "Confirmed",
        stock_reduced: true
      })
      .eq("id", id);

    if (verifyError) {
      throw verifyError;
    }


    // 5. Send confirmation email
    const { data: emailData, error: emailError } =
      await db.functions.invoke(
        "send-order-confirmation",
        {
          body: {
            customer_email: order.customer_email,
            customer_name: order.customer_name,
            order_number: order.order_number,
            total: order.total,
            remaining_cod: order.remaining_cod,
            delivery_speed: order.delivery_speed,
            express_fee: order.express_fee
          }
        }
      );


    if (emailError) {

      console.error(
        "Email error:",
        emailError
      );

      alert(
        "Payment verified and stock updated, but the confirmation email could not be sent."
      );

      await renderSupabaseAdmin();
      return;
    }


    console.log(
      "Email sent:",
      emailData
    );


    alert(
      "Payment verified!\n\n" +
      "Stock updated.\n" +
      "Order confirmed.\n" +
      "Confirmation email sent to:\n" +
      order.customer_email
    );


    await renderSupabaseAdmin();


  } catch (error) {

    console.error(
      "Verify payment error:",
      error
    );

    alert(
      "Could not verify payment or update stock."
    );

  }

};
  window.rejectPayment = async function(id) {

  try {

    if (!confirm(
      "Reject this customer's payment?"
    )) {
      return;
    }


    // Load order details first
    const { data: order, error: orderError } = await db
      .from("orders")
      .select(`
        order_number,
        customer_name,
        customer_email
      `)
      .eq("id", id)
      .single();

    if (orderError) {
      throw orderError;
    }


    // Reject payment and cancel order
    const { error: rejectError } = await db
      .from("orders")
      .update({
        payment_status: "rejected",
        status: "Cancelled"
      })
      .eq("id", id);

    if (rejectError) {
      throw rejectError;
    }


    // Send cancellation email
    if (order.customer_email) {

      const { error: cancelledEmailError } =
        await db.functions.invoke(
          "send-cancelled-email",
          {
            body: {
              customer_email: order.customer_email,
              customer_name: order.customer_name,
              order_number: order.order_number
            }
          }
        );

      if (cancelledEmailError) {

        console.error(
          "Cancelled email error:",
          cancelledEmailError
        );

        alert(
          "Payment rejected and order cancelled, but the cancellation email could not be sent."
        );

        await renderSupabaseAdmin();
        return;
      }

    }


    alert(
      "Payment rejected.\n\n" +
      "Order cancelled and customer email sent."
    );

    await renderSupabaseAdmin();


  } catch (error) {

    console.error(
      "Reject payment error:",
      error
    );

    alert(
      "Could not reject payment."
    );

  }

};

    
    window.markCodReceived = async function(id, amount) {

  try {

    if (!confirm(
      "Confirm COD payment received?\n\nAmount: " + money(amount)
    )) {
      return;
    }

    const { error } = await db
      .from("orders")
      .update({
        cod_received: Number(amount),
        cod_received_at: new Date().toISOString(),
        remaining_cod: 0,
        payment_status: "fully_paid",
        status: "Delivered"
      })
      .eq("id", id);

    if (error) {
      console.error("COD update error:", error);
      alert("Could not mark COD as received.");
      return;
    }

    const { data: order, error: orderLoadError } = await db
      .from("orders")
      .select(`
        order_number,
        customer_name,
        customer_email,
        cod_received
      `)
      .eq("id", id)
      .single();

    if (orderLoadError) {
      console.error(
        "Could not load order for payment email:",
        orderLoadError
      );
    }

    if (order && order.customer_email) {

      const { error: paymentEmailError } =
        await db.functions.invoke(
          "send-payment-complete-email",
          {
            body: {
              customer_email: order.customer_email,
              customer_name: order.customer_name,
              order_number: order.order_number,
              cod_received: order.cod_received
            }
          }
        );

      if (paymentEmailError) {
        console.error(
          "Payment complete email error:",
          paymentEmailError
        );

        alert(
          "COD was marked as received, but the payment email could not be sent."
        );
      }
    }

    alert(
      "COD payment received successfully.\n\n" +
      "Amount received: " + money(amount)
    );

    await renderSupabaseAdmin();

  } catch (error) {

    console.error("COD error:", error);
    alert("Could not mark COD as received.");

  }

};


window.filterOrders = function(status) {

  const rows =
    document.querySelectorAll(
      "#tab-orders .adminTable tr[data-order-status]"
    );

  rows.forEach(row => {

    const rowStatus =
      row.getAttribute("data-order-status");

    if (
      status === "all" ||
      rowStatus === status
    ) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }

  });

};


})();
