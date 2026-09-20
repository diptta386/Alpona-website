(function(){

const HUMAN_CONTACT_URL = "https://wa.me/";

const btn = document.createElement("button");
btn.id = "alponaChatBtn";
btn.textContent = "Chat with Alpona";
btn.style.cssText = `
position:fixed;
right:22px;
bottom:22px;
z-index:9999;
border:1px solid rgba(255,255,255,.18);
border-radius:999px;
background:#6f1f19;
color:white;
padding:15px 21px;
font:600 11px "DM Sans",Arial,sans-serif;
letter-spacing:1px;
text-transform:uppercase;
box-shadow:0 14px 38px rgba(60,24,20,.24);
cursor:pointer;
transition:transform .25s ease,background .25s ease;
`;

btn.onmouseenter = function(){
  btn.style.transform = "translateY(-2px)";
  btn.style.background = "#4f1713";
};
btn.onmouseleave = function(){
  btn.style.transform = "translateY(0)";
  btn.style.background = "#6f1f19";
};

document.body.appendChild(btn);

const box = document.createElement("div");
box.id = "alponaChat";
box.style.cssText = `
position:fixed;
right:22px;
bottom:84px;
width:390px;
max-width:calc(100vw - 28px);
height:560px;
max-height:72vh;
background:#fffdf8;
border:1px solid #dfd2c2;
border-radius:4px;
z-index:9999;
box-shadow:0 28px 75px rgba(38,16,14,.25);
display:none;
overflow:hidden;
font-family:"DM Sans",Arial,sans-serif;
flex-direction:column;
`;

box.innerHTML = `
<div style="
background:#4f1713;
color:white;
padding:18px 19px;
display:flex;
justify-content:space-between;
align-items:flex-start;
">
  <div>
    <div style="
      font-family:'Cormorant Garamond',Georgia,serif;
      font-size:25px;
      line-height:1;
      font-weight:500;
      letter-spacing:.3px;
    ">Alpona Assistant</div>
    <div style="
      font-size:9px;
      letter-spacing:1.3px;
      text-transform:uppercase;
      opacity:.72;
      margin-top:7px;
    ">AI support · Real person available</div>
  </div>
  <button id="acClose" aria-label="Close chat" style="
    border:0;
    background:none;
    color:white;
    font-size:25px;
    line-height:1;
    cursor:pointer;
    padding:0;
  ">×</button>
</div>

<div id="acMsgs" style="
flex:1;
overflow:auto;
padding:18px;
background:#f6efe3;
"></div>

<div style="
padding:11px 14px;
background:#fffdf8;
border-top:1px solid #dfd2c2;
">
  <button id="acHuman" style="
    border:1px solid rgba(111,31,25,.45);
    background:transparent;
    color:#6f1f19;
    padding:9px 12px;
    font:600 9px 'DM Sans',Arial,sans-serif;
    letter-spacing:1.1px;
    text-transform:uppercase;
    cursor:pointer;
  ">Talk to a real person</button>
</div>

<form id="acForm" style="
display:flex;
gap:8px;
padding:12px;
background:#fffdf8;
border-top:1px solid #dfd2c2;
">
  <input id="acInput" placeholder="Ask about products, delivery, orders..." style="
    flex:1;
    min-width:0;
    padding:12px;
    border:1px solid #dfd2c2;
    border-radius:0;
    background:white;
    font:13px 'DM Sans',Arial,sans-serif;
  ">
  <button style="
    border:0;
    background:#6f1f19;
    color:white;
    border-radius:0;
    padding:0 17px;
    font:600 10px 'DM Sans',Arial,sans-serif;
    letter-spacing:.8px;
    text-transform:uppercase;
    cursor:pointer;
  ">Send</button>
</form>
`;

document.body.appendChild(box);

function addMessage(text, user){
  const message = document.createElement("div");
  message.textContent = text;
  message.style.cssText = `
    max-width:84%;
    padding:11px 13px;
    border-radius:2px;
    margin:8px 0;
    line-height:1.5;
    font-size:12px;
    white-space:pre-wrap;
  `;

  if(user){
    message.style.background = "#6f1f19";
    message.style.color = "white";
    message.style.marginLeft = "auto";
  }else{
    message.style.background = "#fffdf8";
    message.style.border = "1px solid #dfd2c2";
    message.style.color = "#2c211c";
  }

  document.getElementById("acMsgs").appendChild(message);
  document.getElementById("acMsgs").scrollTop = 99999;
}

function assistantReply(message){
  message = message.toLowerCase();

  if(message.includes("delivery") || message.includes("shipping")){
    return "Delivery is charged once per order. Inside Dhaka is ৳80 and outside Dhaka is ৳140.";
  }

  if(message.includes("payment") || message.includes("bkash") || message.includes("cash")){
    return "Alpona currently supports Cash on Delivery and manual bKash confirmation.";
  }

  if(message.includes("order") || message.includes("track")){
    return "For a specific order status, please choose 'Talk to a real person' so Alpona support can confirm it.";
  }

  if(message.includes("price")){
    return "Product prices are shown on each product page. Tell me which product you are interested in.";
  }

  return "I can help with Alpona products, delivery, payments and general order questions. If you need personal assistance, choose 'Talk to a real person'.";
}

btn.onclick = function(){
  box.style.display = "flex";

  if(!box.dataset.started){
    addMessage(
      "Assalamu Alaikum! I'm the Alpona Assistant. How can I help you today?",
      false
    );
    box.dataset.started = "1";
  }
};

document.getElementById("acClose").onclick = function(){
  box.style.display = "none";
};

document.getElementById("acHuman").onclick = function(){
  addMessage(
    "I'll connect you with a real Alpona support person.",
    false
  );

  if(HUMAN_CONTACT_URL !== "https://wa.me/"){
    window.open(HUMAN_CONTACT_URL,"_blank");
  }else{
    alert("Alpona human support contact will be available here.");
  }
};

document.getElementById("acForm").onsubmit = function(event){
  event.preventDefault();

  const input = document.getElementById("acInput");
  const message = input.value.trim();

  if(!message) return;

  input.value = "";
  addMessage(message,true);

  if(window.alponaHumanMode === true){
    return;
  }

  setTimeout(function(){
    addMessage(assistantReply(message),false);
  },350);
};

})();