(function () {

  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";

  let chatSessionId =
    localStorage.getItem("alpona_chat_session_id") || null;


  function showChatNotice(text, isError) {

    const container =
      document.getElementById("acMsgs");

    if (!container) {
      alert(text);
      return;
    }

    const div =
      document.createElement("div");

    div.textContent = text;

    div.style.cssText = `
      max-width:82%;
      padding:10px 12px;
      border-radius:12px;
      margin:7px 0;
      line-height:1.45;
      font-size:13px;
      background:${isError ? "#fff0ee" : "#fff"};
      color:${isError ? "#8c2721" : "#2e241e"};
      border:1px solid ${isError ? "#d9a8a3" : "#eadbc5"};
    `;

    container.appendChild(div);

    container.scrollTop =
      container.scrollHeight;
  }


  async function ensureAnonymousUser() {

    const {
      data: sessionData,
      error: sessionError
    } =
      await db.auth.getSession();

    if (sessionError) {
      console.error(
        "Could not read Supabase session:",
        sessionError
      );
    }

    if (sessionData?.session?.user) {
      return sessionData.session.user;
    }

    const { data, error } =
      await db.auth.signInAnonymously();

    if (error) {

      console.error(
        "Anonymous login error:",
        error
      );

      showChatNotice(
        "Live support could not connect. Please try again shortly.",
        true
      );

      return null;
    }

    return data?.user || null;
  }


  async function ensureChatSession() {

    const user =
      await ensureAnonymousUser();

    if (!user) return null;

    if (user.id === OWNER_UID) {

      showChatNotice(
        "Owner mode is signed in on this browser. Please test customer chat in an Incognito/Private window.",
        true
      );

      return null;
    }

    if (chatSessionId) {

      const {
        data,
        error
      } =
        await db
          .from("chat_sessions")
          .select("*")
          .eq("id", chatSessionId)
          .maybeSingle();

      if (!error && data) {
        return data;
      }

      if (error) {
        console.warn(
          "Stored chat session could not be reused:",
          error
        );
      }

      chatSessionId = null;

      localStorage.removeItem(
        "alpona_chat_session_id"
      );
    }


    const {
      data,
      error
    } =
      await db
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

      showChatNotice(
        "Your support chat could not be started. Please try again.",
        true
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


  async function saveChatMessage(
    sender,
    message
  ) {

    const session =
      await ensureChatSession();

    if (!session) {
      return false;
    }


    const { error } =
      await db
        .from("chat_messages")
        .insert({
          session_id: session.id,
          sender,
          message
        });


    if (error) {

      console.error(
        "Could not save chat message:",
        error
      );

      showChatNotice(
        "This message was not delivered to Alpona support. Please try again.",
        true
      );

      return false;
    }

    return true;
  }


  async function requestHumanAgent() {

    const session =
      await ensureChatSession();

    if (!session) {
      return false;
    }


    const { error } =
      await db
        .from("chat_sessions")
        .update({
          status: "waiting_for_agent",
          updated_at:
            new Date().toISOString()
        })
        .eq("id", session.id);


    if (error) {

      console.error(
        "Could not request agent:",
        error
      );

      showChatNotice(
        "Could not notify Alpona support. Please try again.",
        true
      );

      return false;
    }


    const saved =
      await saveChatMessage(
        "system",
        "Customer requested a real agent."
      );

    if (!saved) {
      return false;
    }


    window.alponaHumanMode = true;

    showChatNotice(
      "Alpona support has been notified. Please keep this chat open.",
      false
    );

    return true;
  }


  async function loadHumanReplies() {

    if (!chatSessionId) return;


    const { data, error } =
      await db
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
        )].map(
          el =>
            el.getAttribute(
              "data-db-message"
            )
        )
      );


    (data || []).forEach(msg => {

      window.alponaHumanMode = true;

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

      /*
        Remove the old placeholder handler from alpona-chat.js.
        That handler claimed a human handoff even when nothing
        was saved to Supabase.
      */
      humanButton.onclick = null;

      humanButton.addEventListener(
        "click",
        async function () {

          humanButton.disabled = true;

          try {
            await requestHumanAgent();
          } finally {
            humanButton.disabled = false;
          }

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