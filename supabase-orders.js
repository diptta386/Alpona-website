window.placeOrder = async function(event) {

  event.preventDefault();

  const form = event.target;
  const fd = new FormData(form);
  const ps = products();

  if (!cart.length) {
    alert("Your cart is empty.");
    return;
  }

  const items = cart.map(item => {

    const product = ps.find(p => p.id === item.id);

    return {
      product_name: product.name,
      quantity: item.qty,
      price: Number(product.price)
    };

  });

  const subtotal = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const deliveryFee =
    fd.get("area") === "Inside Dhaka" ? 80 : 140;

  const total = subtotal + deliveryFee;

  const orderId = Date.now();

  const orderNumber = "ALP-" + orderId;

  const orderData = {
    id: orderId,
    order_number: orderNumber,
    customer_name: fd.get("name"),
    phone: fd.get("phone"),
    address: fd.get("address"),
    area: fd.get("area"),
    payment_method: fd.get("payment"),
    subtotal: subtotal,
    delivery_fee: deliveryFee,
    total: total,
    status: "New"
  };

  try {

    const { error: orderError } =
      await db
        .from("orders")
        .insert([orderData]);

    if (orderError) {
      console.error(orderError);
      throw orderError;
    }

    const orderItems = items.map(item => ({
      order_id: orderId,
      product_id: null,
      product_name: item.product_name,
      quantity: item.quantity,
      price: item.price
    }));

    const { error: itemsError } =
      await db
        .from("order_items")
        .insert(orderItems);

    if (itemsError) {
      console.error(itemsError);
      throw itemsError;
    }

    cart = [];

    set("alpona_cart", cart);

    renderCart();

    form.reset();

    closeModal("checkoutModal");

    alert(
      "Order successfully placed!\n\n" +
      "Order Number: " + orderNumber +
      "\nTotal: " + money(total)
    );

  } catch (error) {

    console.error(error);

    alert(
      "Order could not be submitted. Please try again."
    );

  }

};
