(function () {

  let selectedChatSession = null;


  async function loadOwnerChats() {

    const container =
      document.getElementById("ownerChatList");

    if (!container) return;

    container.innerHTML =
      "<p>Loading customer chats...</p>";


    const { data, error } = await db
      .from("chat_sessions")
      .select("*")
      .order("updated_at", {
        ascending: false
      });


    if (error) {

      console.error(
        "Could not load chats:",
        error
      );

      container.innerHTML =
        "<p>Could not load chats.</p>";

      return;
    }


    if (!data || !data.length) {

      container.innerHTML =
        "<p>No customer chats yet.</p>";

      return;
    }


    container.innerHTML =
      data.map(chat => {

        let status =
          chat.status || "ai";


        if (
          status ===
          "waiting_for_agent"
        ) {
          status =
            "Waiting for you";
        }


        if (
          status ===
          "agent_joined"
        ) {
          status =
            "You joined";
        }


        return `

          <div
            style="
              border:1px solid #eadbc5;
              padding:15px;
              margin:10px 0;
              background:white;
            "
          >

            <div
              style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:20px;
              "
            >

              <div>

                <b>
                  ${
                    chat.customer_name ||
                    "Customer"
                  }
                </b>

                <br>

                <small>
                  ${
                    chat.customer_phone ||
                    "No phone provided"
                  }
                </small>

                <br>

                <small>
                  ${new Date(
                    chat.updated_at ||
                    chat.created_at
                  ).toLocaleString()}
                </small>

              </div>


              <div>

                <b>${status}</b>

                <br><br>

                <button
                  class="primary"
                  onclick="
                    openOwnerChat(
                      '${chat.id}'
                    )
                  "
                >
                  Open Chat
                </button>

              </div>

            </div>

          </div>

        `;

      }).join("");

  }



  async function openOwnerChat(
    sessionId
  ) {

    selectedChatSession =
      sessionId;


    const { data, error } =
      await db
        .from("chat_messages")
        .select("*")
        .eq(
          "session_id",
          sessionId
        )
        .order(
          "created_at",
          {
            ascending: true
          }
        );


    if (error) {

      console.error(error);

      alert(
        "Could not load messages."
      );

      return;
    }


    showChatWindow(
      data || []
    );

  }



  function showChatWindow(
    messages
  ) {

    let modal =
      document.getElementById(
        "ownerChatModal"
      );


    if (!modal) {

      modal =
        document.createElement(
          "div"
        );


      modal.id =
        "ownerChatModal";


      modal.className =
        "modal";


      modal.innerHTML = `

        <div
          class="modalCard"
          style="
            width:min(650px,96vw);
          "
        >

          <button
            class="x"
            onclick="
              closeModal(
                'ownerChatModal'
              )
            "
          >
            ×
          </button>


          <h2>
            Customer Chat
          </h2>


          <div
            id="ownerMessages"
            style="
              height:330px;
              overflow:auto;
              padding:15px;
              background:#fbf3e3;
              border:1px solid #eadbc5;
              margin-bottom:15px;
            "
          ></div>


          <form
            id="ownerReplyForm"
          >

            <label>

              Your Reply

              <textarea
                id="ownerReplyText"
                required
                placeholder="Type your reply..."
              ></textarea>

            </label>


            <button
              class="primary full"
            >
              Send Reply
            </button>

          </form>


          <button
            class="secondary full"
            style="
              margin-top:10px;
            "
            onclick="
              closeChatConversation()
            "
          >
            Mark Conversation Closed
          </button>

        </div>

      `;


      document.body.appendChild(
        modal
      );


      document
        .getElementById(
          "ownerReplyForm"
        )
        .addEventListener(
          "submit",
          sendOwnerReply
        );

    }


    renderMessages(
      messages
    );


    modal.classList.add(
      "show"
    );

  }



  function renderMessages(
    messages
  ) {

    const container =
      document.getElementById(
        "ownerMessages"
      );


    if (!container) return;


    container.innerHTML =
      messages.map(msg => {

        const owner =
          msg.sender === "owner";


        return `

          <div
            style="
              max-width:80%;
              margin:
                ${owner
                  ? "8px 0 8px auto"
                  : "8px auto 8px 0"};
              padding:10px 12px;
              border-radius:10px;
              background:
                ${owner
                  ? "#6f1f19"
                  : "white"};
              color:
                ${owner
                  ? "white"
                  : "#2e241e"};
              border:
                ${owner
                  ? "none"
                  : "1px solid #eadbc5"};
            "
          >

            <b>
              ${
                owner
                  ? "You"
                  : msg.sender ===
                    "system"
                  ? "System"
                  : "Customer"
              }
            </b>

            <br>

            ${msg.message}

            <br>

            <small
              style="
                opacity:.7;
              "
            >

              ${new Date(
                msg.created_at
              ).toLocaleTimeString()}

            </small>

          </div>

        `;

      }).join("");


    container.scrollTop =
      container.scrollHeight;

  }



  async function sendOwnerReply(
    event
  ) {

    event.preventDefault();


    if (!selectedChatSession)
      return;


    const textarea =
      document.getElementById(
        "ownerReplyText"
      );


    const message =
      textarea.value.trim();


    if (!message) return;


    const { error } =
      await db
        .from("chat_messages")
        .insert({

          session_id:
            selectedChatSession,

          sender:
            "owner",

          message:
            message

        });


    if (error) {

      console.error(error);

      alert(
        "Could not send reply."
      );

      return;
    }


    textarea.value = "";


    await db
      .from("chat_sessions")
      .update({

        status:
          "agent_joined",

        updated_at:
          new Date().toISOString()

      })
      .eq(
        "id",
        selectedChatSession
      );


    await openOwnerChat(
      selectedChatSession
    );


    await loadOwnerChats();

  }



  async function closeChatConversation() {

    if (!selectedChatSession)
      return;


    const { error } =
      await db
        .from("chat_sessions")
        .update({

          status:
            "closed",

          updated_at:
            new Date().toISOString()

        })
        .eq(
          "id",
          selectedChatSession
        );


    if (error) {

      console.error(error);

      alert(
        "Could not close chat."
      );

      return;
    }


    closeModal(
      "ownerChatModal"
    );


    selectedChatSession =
      null;


    await loadOwnerChats();

  }



  window.loadOwnerChats =
    loadOwnerChats;

  window.openOwnerChat =
    openOwnerChat;

  window.closeChatConversation =
    closeChatConversation;



  setInterval(
    function () {

      const admin =
        document.getElementById(
          "adminPanel"
        );


      if (
        admin &&
        admin.classList.contains(
          "show"
        )
      ) {

        loadOwnerChats();

      }

    },
    5000
  );

})();
