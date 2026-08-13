window.placeOrder = async function(event) {

  event.preventDefault();

  try {

    const form = event.target;
    const fd = new FormData(form);
    const ps = products();

    if (!cart || !cart.length) {
      alert("Your cart is empty. Please add the product again.");
      return;
    }

    const paymentOption =
      fd.get("payment_option");

    const advanceMethod =
      fd.get("advance_method");

    const transactionId =
      fd.get("advance_transaction_id");


    if (!paymentOption) {
      alert("Please select a payment option.");
      return;
    }

    if (!advanceMethod) {
      alert("Please select bKash or Nagad.");
      return;
    }

    if (!transactionId || !transactionId.trim()) {
      alert("Please enter your Transaction ID.");
      return;
    }


    const items = [];

    for (const item of cart) {

      const product = ps.find(
        p => Number(p.id) === Number(item.id)
      );

      if (!product) {

        console.error(
          "Product not found for cart item:",
          item
        );

        alert(
  "Product ID problem.\n\n" +
  "Cart product ID: " + item.id + "\n" +
  "Available product IDs: " + ps.map(p => p.id).join(", ")
);

        return;
      }

      items.push({
        product_id: product.id,
        product_name: product.name,
        quantity: Number(item.qty),
        price: Number(product.price)
      });

    }


    const subtotal = items.reduce(
      (sum, item) =>
        sum + item.price * item.quantity,
      0
    );


    const area = fd.get("area");

    const deliveryFee =
      area === "Inside Dhaka"
        ? 80
        : 140;


    const total =
      subtotal + deliveryFee;


    let advanceAmount = 0;
    let remainingCOD = 0;


    if (paymentOption === "full_payment") {

      advanceAmount = total;
      remainingCOD = 0;

    } else {

      advanceAmount = deliveryFee;
      remainingCOD = subtotal;

    }


    const orderId = Date.now();

    const orderNumber =
      "ALP-" + orderId;


    const orderData = {

      id: orderId,

      order_number: orderNumber,

      customer_name:
        fd.get("name"),

      phone:
        fd.get("phone"),
      
      customer_email:
  fd.get("customer_email"),

      address:
        fd.get("address"),

      area:
        area,

      payment_method:
        advanceMethod,

      payment_option:
        paymentOption,

      subtotal:
        subtotal,

      delivery_fee:
        deliveryFee,

      total:
        total,

      advance_method:
        advanceMethod,

      advance_transaction_id:
        transactionId.trim(),

      advance_amount:
        advanceAmount,

      remaining_cod:
        remainingCOD,

      payment_status:
        "pending_verification",

      status:
        "Pending Payment"
    };


    const { error: orderError } =
      await db
        .from("orders")
        .insert([orderData]);


    if (orderError) {

      console.error(
        "Order error:",
        orderError
      );

      throw orderError;
    }


    const orderItems =
      items.map(item => ({

        order_id:
          orderId,

        product_id:
          item.product_id,

        product_name:
          item.product_name,

        quantity:
          item.quantity,

        price:
          item.price

      }));


    const { error: itemsError } =
      await db
        .from("order_items")
        .insert(orderItems);


    if (itemsError) {

      console.error(
        "Order items error:",
        itemsError
      );

      throw itemsError;
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

    console.error(
      "Checkout error:",
      error
    );

    alert(
      "Order could not be submitted.\n\nPlease refresh the page, clear the cart, add the product again, and try again."
    );

  }

};
