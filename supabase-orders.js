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


    const pathaoCityId =
  Number(fd.get("pathao_city_id"));

const pathaoZoneId =
  Number(fd.get("pathao_zone_id"));

const pathaoAreaId =
  Number(fd.get("pathao_area_id"));

const citySelect =
  document.getElementById("pathaoCity");

const zoneSelect =
  document.getElementById("pathaoZone");

const areaSelect =
  document.getElementById("pathaoArea");


const pathaoCityName =
  fd.get("pathao_city_name") ||
  citySelect?.options[
    citySelect.selectedIndex
  ]?.text ||
  "";


const pathaoZoneName =
  fd.get("pathao_zone_name") ||
  zoneSelect?.options[
    zoneSelect.selectedIndex
  ]?.text ||
  "";


const pathaoAreaName =
  fd.get("pathao_area_name") ||
  areaSelect?.options[
    areaSelect.selectedIndex
  ]?.text ||
  "";


if (
  !pathaoCityId ||
  !pathaoZoneId ||
  !pathaoAreaId
) {
  alert(
    "Please select your City, Zone and Area."
  );
  return;
}


const deliveryFee =
  Number(currentPathaoDeliveryFee || 0);


if (deliveryFee <= 0) {
  alert(
    "Delivery fee could not be calculated.\n\nPlease select City, Zone and Area again."
  );
  return;
}


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
  pathaoAreaName,

pathao_city_id:
  pathaoCityId,

pathao_city_name:
  pathaoCityName,

pathao_zone_id:
  pathaoZoneId,

pathao_zone_name:
  pathaoZoneName,

pathao_area_id:
  pathaoAreaId,

pathao_area_name:
  pathaoAreaName,

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
   
// PostHog: track successful order
    
if (window.posthog) {


  window.posthog.capture(
    "order_placed",
    {
      order_number: orderNumber,
      total: Number(total)
    }
  );

}
// PostHog: track each purchased product
if (window.posthog) {

  items.forEach(item => {

    window.posthog.capture(
      "product_purchased",
      {
        order_number: orderNumber,
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0)
      }
    );

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

    console.error(
      "Checkout error:",
      error
    );

    alert(
      "Order could not be submitted.\n\nPlease refresh the page, clear the cart, add the product again, and try again."
    );

  }

};
