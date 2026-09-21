window.placeOrder = async function(event) {
  event.preventDefault();

  const form = event.target;
  const button = form.querySelector('button[type="submit"]');

  try {
    const fd = new FormData(form);
    const ps = products();

    if (!cart || !cart.length) {
      alert("Your cart is empty. Please add the product again.");
      return;
    }

    const items = cart.map(item => ({
      product_id: Number(item.id),
      quantity: Number(item.qty || 1)
    }));

    const payload = {
      customer: {
        name: fd.get("name"),
        phone: fd.get("phone"),
        email: fd.get("customer_email"),
        address: fd.get("address"),
        pathao_city_id: Number(fd.get("pathao_city_id")),
        pathao_city_name: fd.get("pathao_city_name"),
        pathao_zone_id: Number(fd.get("pathao_zone_id")),
        pathao_zone_name: fd.get("pathao_zone_name"),
        pathao_area_id: Number(fd.get("pathao_area_id")),
        pathao_area_name: fd.get("pathao_area_name")
      },
      payment_option: fd.get("payment_option"),
      advance_method: fd.get("advance_method"),
      advance_transaction_id: String(
        fd.get("advance_transaction_id") || ""
      ).trim(),
      items
    };

    if (!payload.payment_option) {
      alert("Please select a payment option.");
      return;
    }

    if (!payload.advance_method) {
      alert("Please select bKash or Nagad.");
      return;
    }

    if (!payload.advance_transaction_id) {
      alert("Please enter your Transaction ID.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Submitting securely…";
    }

    const { data, error } = await db.functions.invoke(
      "submit-order",
      { body: payload }
    );

    if (error) {
      throw new Error(
        data?.error ||
        error.message ||
        "Order submission failed."
      );
    }

    if (!data?.success) {
      throw new Error(
        data?.error ||
        "Order submission failed."
      );
    }

    const orderNumber = data.order_number;
    const total = Number(data.total || 0);
    const advanceAmount = Number(data.advance_amount || 0);
    const remainingCOD = Number(data.remaining_cod || 0);

    if (window.posthog) {
      window.posthog.capture("order_placed", {
        order_number: orderNumber,
        total
      });

      cart.forEach(item => {
        const p = ps.find(
          product => Number(product.id) === Number(item.id)
        );

        if (!p) return;

        window.posthog.capture("product_purchased", {
          order_number: orderNumber,
          product_id: p.id,
          product_name: p.name,
          quantity: Number(item.qty || 1),
          price: Number(p.price || 0)
        });
      });
    }

    if (window.alponaTrack) {
      window.alponaTrack("order_placed", {
        quantity: 1,
        value: total
      });

      cart.forEach(item => {
        const p = ps.find(
          product => Number(product.id) === Number(item.id)
        );

        if (!p) return;

        window.alponaTrack("product_purchased", {
          product_id: p.id,
          product_name: p.name,
          quantity: Number(item.qty || 1),
          value:
            Number(p.price || 0) *
            Number(item.qty || 1)
        });
      });
    }

    cart = [];
    set("alpona_cart", cart);
    renderCart();
    form.reset();
    closeModal("checkoutModal");

    alert(
      "Order submitted successfully!\n\n" +
      "Order Number: " + orderNumber +
      "\nAmount Submitted: " + money(advanceAmount) +
      "\nRemaining COD: " + money(remainingCOD) +
      "\n\nPayment is waiting for verification."
    );

  } catch (error) {
    console.error("Checkout error:", error);

    const message =
      error?.message ||
      "Order could not be submitted.";

    alert(
      message +
      "\n\nPlease check your information and try again."
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Place Order";
    }
  }
};
