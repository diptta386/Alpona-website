(function () {

  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";

  let chatSessionId = localStorage.getItem("alpona_chat_session_id") || null;

  async function ensureAnonymousUser() {

    const { data: sessionData } = await db.auth.getSession();

    if (sessionData.session) {
      return sessionData.session.user;
    }

    const { data, error } = await db.auth.signInAnonymously();

    if (error) {
      console.error("Anonymous login error:", error);
      return null;
    }

    return data.user;
  }


  async function ensureChatSession() {

    const user = await ensureAnonymousUser();

    if (!user) return null;

    if (user.id === OWNER_UID) {
      return null;
    }

    if (chatSessionId) {

      const { data } = await db
        .from("chat_sessions")
        .select("*")
        .eq("id", chatSessionId)
        .maybeSingle();

      if (data) return data;
    }


    const { data, error } = await db
      .from("chat_sessions")
      .insert({
        customer_user_id: user.id,
        status: "ai"
      })
      .select()
      .single();


    if (error) {

      console.error(
        "Could not create chat session:",
        error
      );

      return null;
    }


    chatSessionId = data.id;

    localStorage.setItem(
      "alpona_chat_session_id",
      data.id
    );

    return data;

  }


  async function saveChatMessage(sender, message) {

    const session =
      await ensureChatSession();

    if (!session) return;


    const { error } = await db
      .from("chat_messages")
      .insert({
        session_id: session.id,
        sender: sender,
        message: message
      });


    if (error) {

      console.error(
        "Could not save chat message:",
        error
      );

    }

  }


  async function requestHumanAgent() {

    const session =
      await ensureChatSession();

    if (!session) return;


    const { error } = await db
      .from("chat_sessions")
      .update({
        status: "waiting_for_agent",
        updated_at: new Date().toISOString()
      })
      .eq("id", session.id);


    if (error) {

      console.error(
        "Could not request agent:",
        error
      );

      return;

    }


    await saveChatMessage(
      "system",
      "Customer requested a real agent."
    );


    alert(
      "Alpona support has been notified. Please keep this chat open."
    );

  }


  async function loadHumanReplies() {

    if (!chatSessionId) return;


    const { data, error } = await db
      .from("chat_messages")
      .select("*")
      .eq("session_id", chatSessionId)
      .eq("sender", "owner")
      .order("created_at", {
        ascending: true
      });


    if (error) {

      console.error(
        "Could not load agent replies:",
        error
      );

      return;
    }


    const container =
      document.getElementById("acMsgs");


    if (!container) return;


    const shown =
      new Set(
        [...container.querySelectorAll(
          "[data-db-message]"
        )]
        .map(
          el =>
            el.getAttribute(
              "data-db-message"
            )
        )
      );


    (data || []).forEach(msg => {

      if (
        shown.has(
          String(msg.id)
        )
      ) return;


      const div =
        document.createElement("div");


      div.setAttribute(
        "data-db-message",
        msg.id
      );


      div.textContent =
        "Alpona Support: " +
        msg.message;


      div.style.cssText = `
        max-width:82%;
        padding:10px 12px;
        border-radius:12px;
        margin:7px 0;
        line-height:1.45;
        font-size:13px;
        background:#fff;
        border:1px solid #eadbc5;
      `;


      container.appendChild(div);

      container.scrollTop =
        container.scrollHeight;

    });

  }


  /*
    Connect to your existing chat widget
  */

  function connectChatWidget() {

    const form =
      document.getElementById("acForm");

    const input =
      document.getElementById("acInput");

    const humanButton =
      document.getElementById("acHuman");


    if (!form || !input) {

      setTimeout(
        connectChatWidget,
        500
      );

      return;
    }


    if (
      form.dataset.supabaseChat ===
      "yes"
    ) return;


    form.dataset.supabaseChat =
      "yes";


    form.addEventListener(
      "submit",
      async function () {

        const message =
          input.value.trim();

        if (!message) return;


        await saveChatMessage(
          "customer",
          message
        );

      },
      true
    );


    if (humanButton) {

      humanButton.addEventListener(
        "click",
        async function () {

          await requestHumanAgent();

        }
      );

    }


    setInterval(
      loadHumanReplies,
      4000
    );

  }


  connectChatWidget();

})();
