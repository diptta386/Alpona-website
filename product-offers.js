(function () {
  "use strict";
  const OWNER = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
  const FACEBOOK = "https://www.facebook.com/share/1HgJa8dnXX/?mibextid=wwXIfr";
  const INSTAGRAM = "https://www.instagram.com/al.po.na/";
  let offers = [], messenger = "", currentProduct = null, applyVersion = 0;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, x => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[x]));
  const subtotal = () => cart.reduce((sum, item) => {
    const p = products().find(x => Number(x.id) === Number(item.id));
    return sum + Number(p?.price || 0) * Number(item.qty || 1);
  }, 0);
  const cartKey = () => JSON.stringify(cart.map(i => [Number(i.id), Number(i.qty), Number(products().find(p => Number(p.id) === Number(i.id))?.price || 0)]));
  const message = value => { const el = document.getElementById("couponMessage"); if (el) el.textContent = value; };
  window.alponaCoupon = null;
  window.alponaCouponDiscount = function () {
    const c = window.alponaCoupon;
    if (!c) return 0;
    if (c.key !== cartKey()) {
      window.alponaCoupon = null;
      message("Cart changed. Apply your coupon again before payment.");
      return 0;
    }
    return c.discount;
  };
  window.clearCheckoutCoupon = function () {
    applyVersion++;
    window.alponaCoupon = null;
    const input = document.getElementById("checkoutCouponCode");
    if (input) input.value = "";
    message("");
    if (typeof updatePaymentAmounts === "function") updatePaymentAmounts();
  };
  window.applyCheckoutCoupon = async function () {
    const version = ++applyVersion;
    window.alponaCoupon = null;
    const input = document.getElementById("checkoutCouponCode");
    const code = input.value.trim().toUpperCase();
    const button = document.getElementById("couponApplyButton");
    const key = cartKey();
    button.disabled = true;
    message("Checking coupon…");
    try {
      if (!/^[A-Z0-9_-]{3,30}$/.test(code)) throw new Error("Enter a valid coupon code.");
      const { data, error } = await db.rpc("quote_coupon", { p_code: code, p_subtotal: subtotal() });
      if (version !== applyVersion) return;
      if (error) throw new Error("Could not check coupon. Please try again.");
      if (key !== cartKey()) throw new Error("Cart changed. Apply the coupon again.");
      if (!data?.valid) throw new Error(data?.error || "Coupon unavailable.");
      window.alponaCoupon = { code: data.code, discount: Number(data.discount), key };
      input.value = data.code;
      message("Applied " + data.code + " — saved " + money(data.discount) + ". Check the updated payment amount below.");
    } catch (error) {
      if (version === applyVersion) message(error.message);
    } finally {
      button.disabled = false;
      if (typeof updatePaymentAmounts === "function") updatePaymentAmounts();
    }
  };
  document.getElementById("checkoutCouponCode")?.addEventListener("input", () => {
    applyVersion++;
    window.alponaCoupon = null;
    message("Click Apply to update your total.");
    if (typeof updatePaymentAmounts === "function") updatePaymentAmounts();
  });
  function offerText(c) {
    return (c.discount_type === "percent" ? c.amount + "%" : money(c.amount)) + " ছাড়" +
      (Number(c.min_order) > 0 ? " · " + money(c.min_order) + "+ পণ্যের অর্ডারে" : "") +
      (c.max_discount ? " · সর্বোচ্চ " + money(c.max_discount) : "");
  }
  window.copyProductForCustom = async function () {
    if (!currentProduct) return;
    const text = "Alpona custom design request\nProduct: " + currentProduct.name +
      "\nListed price: " + money(currentProduct.price) + "\nWebsite: https://alponastore.com/\nProduct ID: " + currentProduct.id;
    try { await navigator.clipboard.writeText(text); toast("Product details copied — paste into your message"); }
    catch (_) { prompt("Copy these product details and paste into your message:", text); }
  };
  window.copyOfferCode = async function (code) {
    try { await navigator.clipboard.writeText(code); toast("Coupon copied: " + code); }
    catch (_) { prompt("Copy coupon:", code); }
  };
  window.renderProductExtras = function (p) {
    currentProduct = p;
    const offerRoot = document.getElementById("productCouponOffers");
    if (offerRoot) {
      offerRoot.replaceChildren();
      if (offers.length) {
        const title = document.createElement("h4"); title.textContent = "কুপন অফার"; offerRoot.append(title);
        offers.forEach(c => {
          const b = document.createElement("button");
          b.type = "button"; b.className = "couponChip";
          b.textContent = offerText(c) + " | " + c.code + " ⧉";
          b.title = "Copy coupon code — apply at checkout";
          b.addEventListener("click", () => window.copyOfferCode(c.code)); offerRoot.append(b);
        });
        const note = document.createElement("small"); note.textContent = "কোড কপি করে checkout-এ Apply করুন। এক অর্ডারে একটি কুপন।";
        offerRoot.append(note);
      }
    }
    const root = document.getElementById("productContactActions");
    if (!root) return;
    const direct = /^https:\/\/m\.me\/[A-Za-z0-9.]+$/.test(messenger);
    root.innerHTML = '<p><b>নিজের পছন্দের ডিজাইন চান?</b><br>প্রথমে পণ্যের তথ্য কপি করুন, তারপর মেসেজে paste করে আপনার ডিজাইনের ছবি পাঠান। Custom কাজের দাম ও সময় আলাদা করে নিশ্চিত করা হবে।</p>' +
      '<button type="button" class="secondary full" onclick="copyProductForCustom()">পণ্যের তথ্য কপি করুন</button>' +
      '<div class="productMessageButtons"><a class="messageMessenger" target="_blank" rel="noopener noreferrer" href="' + esc(direct ? messenger : FACEBOOK) + '">' +
      (direct ? "Messenger-এ ডিজাইন পাঠান" : "Facebook পেজে যোগাযোগ") +
      '</a><a class="messageInstagram" target="_blank" rel="noopener noreferrer" href="' + INSTAGRAM + '">Instagram</a></div>' +
      '<small>ছবি chat-এর attachment থেকে পাঠাবেন। এই বাটন কোনো order বা payment তৈরি করে না।</small>';
  };
  async function refreshPublic() {
    const [a,b] = await Promise.all([
      db.from("coupons").select("*").eq("active",true).order("min_order"),
      db.from("site_settings").select("messenger_url").eq("id","homepage").maybeSingle()
    ]);
    if (!a.error) offers = (a.data || []).filter(c => (!c.starts_at || Date.parse(c.starts_at) <= Date.now()) && (!c.expires_at || Date.parse(c.expires_at) > Date.now()));
    if (!b.error) messenger = b.data?.messenger_url || "";
    if (currentProduct && document.getElementById("productModal")?.classList.contains("show")) window.renderProductExtras(currentProduct);
  }
  async function owner() {
    const [u,a] = await Promise.all([db.auth.getUser(),db.auth.mfa.getAuthenticatorAssuranceLevel()]);
    if (u.error || a.error || u.data?.user?.id !== OWNER || a.data?.currentLevel !== "aal2") throw new Error("Owner two-step verification required.");
  }
  let adminOffers = [];
  const dhakaInput = value => value ? new Date(Date.parse(value) + 6*3600000).toISOString().slice(0,16) : "";
  const isoInput = value => value ? new Date(value + ":00+06:00").toISOString() : null;
  window.resetCouponForm = function () { document.getElementById("couponAdminForm").reset(); };
  window.editCouponOffer = function (code) {
    const c = adminOffers.find(x => x.code === code), form = document.getElementById("couponAdminForm");
    if (!c) return;
    for (const key of ["code","discount_type","amount","min_order","max_discount"]) form.elements[key].value = c[key] ?? "";
    form.elements.active.checked = c.active;
    form.elements.starts_at.value = dhakaInput(c.starts_at); form.elements.expires_at.value = dhakaInput(c.expires_at);
    form.scrollIntoView({ behavior:"smooth", block:"start" });
  };
  window.loadOffersAdmin = async function () {
    const root = document.getElementById("couponAdminList");
    root.textContent = "Loading…";
    try {
      await owner();
      const [a,b] = await Promise.all([db.from("coupons").select("*").order("code"),db.from("site_settings").select("messenger_url").eq("id","homepage").maybeSingle()]);
      if (a.error || b.error) throw a.error || b.error;
      adminOffers = a.data || [];
      document.querySelector('[name="messenger_url"]').value = b.data?.messenger_url || "";
      root.innerHTML = adminOffers.length ? adminOffers.map(c => '<article class="couponAdminRow"><div><b>' + esc(c.code) + '</b><p>' + esc(offerText(c)) + '</p><small>' +
        (c.active ? "Enabled" : "Off") + (c.starts_at ? " · Starts " + new Date(c.starts_at).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"}) : "") +
        (c.expires_at ? " · Expires " + new Date(c.expires_at).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"}) : " · No expiry") +
        '</small></div><button type="button" class="secondary" data-code="' + esc(c.code) + '">Edit / Turn off</button></article>').join("") : '<p>No coupons yet. Create your first offer above.</p>';
      root.querySelectorAll("[data-code]").forEach(b => b.addEventListener("click", () => window.editCouponOffer(b.dataset.code)));
    } catch (e) { root.textContent = e.message; }
  };
  window.saveMessengerContact = async function (event) {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      await owner();
      const url = event.target.elements.messenger_url.value.trim().replace(/\/$/,"");
      if (url && !/^https:\/\/m\.me\/[A-Za-z0-9.]+$/.test(url)) throw new Error("Use https://m.me/your.page.username — not a Facebook share link.");
      const { error } = await db.from("site_settings").update({messenger_url:url,updated_at:new Date().toISOString()}).eq("id","homepage");
      if (error) throw error;
      await refreshPublic(); toast("Contact link saved");
    } catch (e) { alert(e.message); } finally { button.disabled = false; }
  };
  window.saveCouponOffer = async function (event) {
    event.preventDefault(); const button = event.submitter; button.disabled = true;
    try {
      await owner(); const e = event.target.elements;
      const payload = { code:e.code.value.trim().toUpperCase(),discount_type:e.discount_type.value,amount:Number(e.amount.value),min_order:Number(e.min_order.value),max_discount:e.max_discount.value ? Number(e.max_discount.value) : null,starts_at:isoInput(e.starts_at.value),expires_at:isoInput(e.expires_at.value),active:e.active.checked };
      if (payload.discount_type === "percent" && payload.amount > 100) throw new Error("Percentage cannot exceed 100.");
      if (payload.expires_at && payload.starts_at && payload.expires_at <= payload.starts_at) throw new Error("Expiry must be after start.");
      const { error } = await db.from("coupons").upsert(payload);
      if (error) throw error;
      window.resetCouponForm(); await window.loadOffersAdmin(); await refreshPublic(); toast("Coupon saved");
    } catch (e) { alert(e.message); } finally { button.disabled = false; }
  };
  refreshPublic().catch(() => {});
})();
