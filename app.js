const DEFAULT_PRODUCTS=[
{id:1,name:"Hand-painted Alpona Décor Set",category:"Home Décor",price:1250,cost:650,stock:8,image:"assets/decor.jpeg",description:"Traditional hand-painted decorative set inspired by Bengali alpona motifs. Perfect for festive décor, gifting and home styling."},
{id:2,name:"Hand-painted Peacock Tote",category:"Bags",price:850,cost:390,stock:12,image:"assets/bag.jpeg",description:"Reusable fabric tote featuring a hand-painted peacock motif and traditional decorative detailing."},
{id:3,name:"Traditional Hand-painted Wear",category:"Clothing",price:1650,cost:780,stock:6,image:"assets/clothing.jpeg",description:"Wearable art inspired by Bengali motifs, combining traditional style with detailed hand-painted craftsmanship."}
];

function get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function set(key,val){localStorage.setItem(key,JSON.stringify(val))}
if (!localStorage.getItem("alpona_products_cache_fixed")) {
  localStorage.removeItem("alpona_products");
  localStorage.removeItem("alpona_cart");
  localStorage.setItem("alpona_products_cache_fixed", "yes");
}
if(!localStorage.getItem("alpona_orders"))set("alpona_orders",[]);
if(!localStorage.getItem("alpona_expenses"))set("alpona_expenses",[]);
let cart=get("alpona_cart",[]);

const money=n=>"৳"+Number(n||0).toLocaleString();
function toast(t){const x=document.getElementById("toast");x.textContent=t;x.classList.add("show");setTimeout(()=>x.classList.remove("show"),1800)}
function closeModal(id){document.getElementById(id).classList.remove("show")}

function products(){return get("alpona_products",[])}
function renderProducts(){
 const ps=products(), cat=document.getElementById("categoryFilter"), current=cat.value;
 const cats=[...new Set(ps.map(p=>p.category))];
 cat.innerHTML='<option value="all">All products</option>'+cats.map(c=>`<option>${c}</option>`).join("");
 if([...cat.options].some(o=>o.value===current))cat.value=current;
 const filtered=cat.value==="all"?ps:ps.filter(p=>p.category===cat.value);
 document.getElementById("products").innerHTML=filtered.map(p=>`<article class="card">
 <img src="${p.image}" alt="${p.name}" onclick="openProduct(${p.id})">
 <div class="cardContent"><small>${p.category}</small><h3>${p.name}</h3>
 <div class="priceRow"><strong class="price">${money(p.price)}</strong><span class="stock">${p.stock>0?p.stock+" available":"Out of stock"}</span></div>
 <button class="primary full" ${p.stock<1?"disabled":""} onclick="addToCart(${p.id})">${p.stock>0?"Add to cart":"Out of stock"}</button></div></article>`).join("");
}
function openProduct(id){
 const p=products().find(x=>x.id===id); if(!p)return;
 document.getElementById("productDetails").innerHTML=`<div class="productDetailGrid"><img src="${p.image}" alt="${p.name}">
 <div><p class="kicker">${p.category}</p><h2>${p.name}</h2><h3 class="price">${money(p.price)}</h3><p>${p.description}</p><p class="stock">${p.stock} in stock</p>
 <button class="primary full" ${p.stock<1?"disabled":""} onclick="addToCart(${p.id});closeModal('productModal')">Add to cart</button></div></div>`;
 document.getElementById("productModal").classList.add("show");
}
function addToCart(id) {

  const productId = Number(id);

  const p = products().find(
    x => Number(x.id) === productId
  );

  if (!p || Number(p.stock) < 1) {
    toast("Product is unavailable");
    return;
  }

  const item = cart.find(
    x => Number(x.id) === productId
  );

  if (item) {
    item.qty++;
  } else {
    cart.push({
      id: productId,
      qty: 1
    });
  }

  set("alpona_cart", cart);

  renderCart();
}


  set("alpona_cart", cart);

  renderCart();
function removeCart(id){
  cart=cart.filter(x=>Number(x.id)!==Number(id));
  set("alpona_cart",cart);
  renderCart();
}
function renderCart(){
 const ps=products(); let total=0,count=0;
 document.getElementById("cartItems").innerHTML=cart.length?cart.map(i=>{const p=ps.find(x=>Number(x.id)===Number(i.id));if(!p)return"";total+=p.price*i.qty;count+=i.qty;return `<div class="cartItem"><img src="${p.image}"><div><h4>${p.name}</h4><span>${i.qty} × ${money(p.price)}</span></div><button onclick="removeCart(${p.id})">×</button></div>`}).join(""):"<p>Your cart is empty.</p>";
 document.getElementById("cartTotal").textContent=money(total);document.getElementById("cartCount").textContent=count;
}
function openCart(){document.getElementById("overlay").classList.add("show");document.getElementById("cartDrawer").classList.add("show")}
function closeCart(){document.getElementById("overlay").classList.remove("show");document.getElementById("cartDrawer").classList.remove("show")}
function openCheckout(){if(!cart.length)return toast("Your cart is empty");closeCart();document.getElementById("checkoutModal").classList.add("show")}
function placeOrder(e){
 e.preventDefault(); const fd=new FormData(e.target), ps=products();
 const items=cart.map(i=>{const p=ps.find(x=>x.id===i.id);return {id:i.id,name:p.name,qty:i.qty,price:p.price,cost:p.cost}});
 const subtotal=items.reduce((s,i)=>s+i.price*i.qty,0), delivery=fd.get("area")==="Inside Dhaka"?80:140, total=subtotal+delivery;
 const order={id:"ALP-"+String(Date.now()).slice(-6),date:new Date().toLocaleString(),name:fd.get("name"),phone:fd.get("phone"),address:fd.get("address"),area:fd.get("area"),payment:fd.get("payment"),items,subtotal,delivery,total,status:"New"};
 const orders=get("alpona_orders",[]);orders.unshift(order);set("alpona_orders",orders);
 items.forEach(i=>{const p=ps.find(x=>x.id===i.id);p.stock=Math.max(0,p.stock-i.qty)});set("alpona_products",ps);
 cart=[];set("alpona_cart",cart);renderCart();renderProducts();e.target.reset();closeModal("checkoutModal");
 toast("Order "+order.id+" placed"); alert("Thank you! Your order number is "+order.id+".\nTotal: "+money(total)+"\nAlpona will confirm your order.");
}
function showAdminLogin(){document.getElementById("loginModal").classList.add("show")}
function adminLogin(e){e.preventDefault();if(document.getElementById("ownerPassword").value!=="alpona2026")return toast("Incorrect password");sessionStorage.setItem("alpona_admin","yes");closeModal("loginModal");openAdmin()}
function openAdmin(){document.querySelector("main").style.display="none";document.querySelector("footer").style.display="none";document.querySelector(".topbar").style.display="none";document.getElementById("adminPanel").classList.add("show");renderAdmin()}
function closeAdmin(){document.getElementById("adminPanel").classList.remove("show");document.querySelector("main").style.display="block";document.querySelector("footer").style.display="grid";document.querySelector(".topbar").style.display="flex";window.scrollTo(0,0)}
function adminLogout(){sessionStorage.removeItem("alpona_admin");closeAdmin()}
function setTab(name){document.querySelectorAll(".tabBody").forEach(x=>x.classList.add("hidden"));document.getElementById("tab-"+name).classList.remove("hidden");document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));[...document.querySelectorAll(".tab")].find(x=>x.textContent.toLowerCase()===name).classList.add("active")}
function renderAdmin(){
 const os=get("alpona_orders",[]), ex=get("alpona_expenses",[]), ps=products();
 const completed=os.filter(o=>!["Cancelled"].includes(o.status));
 const sales=completed.reduce((s,o)=>s+o.total,0);
 const cogs=completed.reduce((s,o)=>s+o.items.reduce((a,i)=>a+(i.cost||0)*i.qty,0),0);
 const expenses=ex.reduce((s,x)=>s+x.amount,0);
 document.getElementById("statSales").textContent=money(sales);document.getElementById("statOrders").textContent=os.length;document.getElementById("statExpenses").textContent=money(expenses);document.getElementById("statProfit").textContent=money(sales-cogs-expenses);
 document.getElementById("tab-orders").innerHTML=`<div class="panelHead"><h3>All Orders</h3></div>${os.length?`<table class="adminTable"><tr><th>Order</th><th>Customer</th><th>Total</th><th>Payment</th><th>Status</th></tr>${os.map(o=>`<tr><td><b>${o.id}</b><br><span class="muted">${o.date}</span></td><td>${o.name}<br>${o.phone}<br><span class="muted">${o.address}</span></td><td>${money(o.total)}</td><td>${o.payment}</td><td><select class="statusSelect" onchange="updateOrder('${o.id}',this.value)">${["New","Confirmed","Processing","Shipped","Delivered","Cancelled"].map(s=>`<option ${o.status===s?"selected":""}>${s}</option>`).join("")}</select></td></tr>`).join("")}</table>`:"<p>No orders yet.</p>"}`;
 document.getElementById("adminProducts").innerHTML=`<table class="adminTable"><tr><th>Product</th><th>Price</th><th>Cost</th><th>Stock</th><th></th></tr>${ps.map(p=>`<tr><td>${p.name}<br><span class="muted">${p.category}</span></td><td>${money(p.price)}</td><td>${money(p.cost)}</td><td>${p.stock}</td><td><button class="secondary" onclick="openProductForm(${p.id})">Edit</button> <button class="danger" onclick="deleteProduct(${p.id})">Delete</button></td></tr>`).join("")}</table>`;
 document.getElementById("expenseList").innerHTML=ex.length?`<table class="adminTable"><tr><th>Date</th><th>Description</th><th>Amount</th><th></th></tr>${ex.map(x=>`<tr><td>${x.date}</td><td>${x.description}</td><td>${money(x.amount)}</td><td><button class="danger" onclick="deleteExpense(${x.id})">Delete</button></td></tr>`).join("")}</table>`:"<p>No expenses entered yet.</p>";
}
function updateOrder(id,status){const os=get("alpona_orders",[]);const o=os.find(x=>x.id===id);if(o)o.status=status;set("alpona_orders",os);renderAdmin();toast("Order updated")}
function openProductForm(id){
 const f=document.getElementById("productForm");f.reset();f.elements.id.value="";
 if(id){const p=products().find(x=>x.id===id);for(const k of ["id","name","category","price","cost","stock","image","description"])f.elements[k].value=p[k];document.getElementById("productFormTitle").textContent="Edit Product"}else document.getElementById("productFormTitle").textContent="Add Product";
 document.getElementById("productFormModal").classList.add("show")
}
function saveProduct(e){e.preventDefault();const f=e.target,fd=new FormData(f),ps=products(),id=Number(fd.get("id"))||Date.now();const p={id,name:fd.get("name"),category:fd.get("category"),price:Number(fd.get("price")),cost:Number(fd.get("cost")),stock:Number(fd.get("stock")),image:fd.get("image"),description:fd.get("description")};const ix=ps.findIndex(x=>x.id===id);if(ix>=0)ps[ix]=p;else ps.push(p);set("alpona_products",ps);closeModal("productFormModal");renderProducts();renderAdmin();toast("Product saved")}
function deleteProduct(id){if(!confirm("Delete this product?"))return;set("alpona_products",products().filter(x=>x.id!==id));renderProducts();renderAdmin()}
function openExpenseForm(){document.getElementById("expenseModal").classList.add("show")}
function saveExpense(e){e.preventDefault();const fd=new FormData(e.target),ex=get("alpona_expenses",[]);ex.unshift({id:Date.now(),date:new Date().toLocaleDateString(),description:fd.get("description"),amount:Number(fd.get("amount"))});set("alpona_expenses",ex);e.target.reset();closeModal("expenseModal");renderAdmin();toast("Expense saved")}
function deleteExpense(id){set("alpona_expenses",get("alpona_expenses",[]).filter(x=>x.id!==id));renderAdmin()}
renderProducts();renderCart();
if(sessionStorage.getItem("alpona_admin")==="yes")openAdmin();
