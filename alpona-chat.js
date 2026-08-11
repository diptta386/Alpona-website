(function(){

const HUMAN_CONTACT_URL = "https://wa.me/";

const btn = document.createElement("button");

btn.id = "alponaChatBtn";
btn.textContent = "Chat with Alpona";

btn.style.cssText = `
position:fixed;
right:20px;
bottom:20px;
z-index:9999;
border:0;
border-radius:999px;
background:#6f1f19;
color:white;
padding:14px 18px;
font:600 14px Arial;
box-shadow:0 8px 28px #0003;
cursor:pointer;
`;

document.body.appendChild(btn);


const box = document.createElement("div");

box.id = "alponaChat";

box.style.cssText = `
position:fixed;
right:20px;
bottom:78px;
width:360px;
max-width:calc(100vw - 30px);
height:500px;
max-height:70vh;
background:#fffdf9;
border:1px solid #eadbc5;
border-radius:16px;
z-index:9999;
box-shadow:0 18px 50px #0004;
display:none;
overflow:hidden;
font-family:Arial,sans-serif;
flex-direction:column;
`;


box.innerHTML = `

<div style="
background:#6f1f19;
color:white;
padding:14px 16px;
display:flex;
justify-content:space-between;
">

<div>

<b>Alpona Assistant</b>

<div style="
font-size:11px;
opacity:.85;
">
AI support until a real agent joins
</div>

</div>

<button
id="acClose"
style="
border:0;
background:none;
color:white;
font-size:22px;
cursor:pointer;
">
×
</button>

</div>


<div
id="acMsgs"
style="
flex:1;
overflow:auto;
padding:14px;
background:#fbf3e3;
">
</div>


<div style="
padding:9px 12px;
background:white;
border-top:1px solid #eee;
">

<button
id="acHuman"
style="
border:1px solid #6f1f19;
background:white;
color:#6f1f19;
padding:8px 10px;
border-radius:8px;
font-size:12px;
cursor:pointer;
">

Talk to a real person

</button>

</div>


<form
id="acForm"
style="
display:flex;
gap:8px;
padding:10px;
background:white;
border-top:1px solid #eee;
">

<input
id="acInput"
placeholder="Ask about products, delivery, orders..."
style="
flex:1;
padding:10px;
border:1px solid #d7c7b2;
border-radius:8px;
">

<button
style="
border:0;
background:#6f1f19;
color:white;
border-radius:8px;
padding:0 14px;
cursor:pointer;
">

Send

</button>

</form>

`;

document.body.appendChild(box);


function addMessage(text, user){

const message = document.createElement("div");

message.textContent = text;

message.style.cssText = `
max-width:82%;
padding:10px 12px;
border-radius:12px;
margin:7px 0;
line-height:1.45;
font-size:13px;
white-space:pre-wrap;
`;

if(user){

message.style.background = "#6f1f19";
message.style.color = "white";
message.style.marginLeft = "auto";

}else{

message.style.background = "white";
message.style.border = "1px solid #eadbc5";

}

document
.getElementById("acMsgs")
.appendChild(message);

document.getElementById("acMsgs").scrollTop = 99999;

}


function assistantReply(message){

message = message.toLowerCase();


if(
message.includes("delivery") ||
message.includes("shipping")
){

return "Delivery is charged once per order. Inside Dhaka is ৳80 and outside Dhaka is ৳140.";

}


if(
message.includes("payment") ||
message.includes("bkash") ||
message.includes("cash")
){

return "Alpona currently supports Cash on Delivery and manual bKash confirmation.";

}


if(
message.includes("order") ||
message.includes("track")
){

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

window.open(
HUMAN_CONTACT_URL,
"_blank"
);

}else{

alert(
"Alpona human support contact will be available here."
);

}

};

document.getElementById("acForm").onsubmit = function(event){

event.preventDefault();

const input =
document.getElementById("acInput");

const message =
input.value.trim();

if(!message) return;

input.value = "";

addMessage(
message,
true
);

/*
Stop automatic AI replies after
customer requests a real person.
*/
if(window.alponaHumanMode === true){

return;

}

setTimeout(function(){

addMessage(
assistantReply(message),
false
);

},350);

};

})();
