(function () {
  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
  const ROLES = {
    operations: ["Operations Manager", "Prepares order, booking and courier work. Never changes payment or order status automatically."],
    content: ["Content & SEO", "Drafts product and homepage copy. Publishing remains locked until owner approval."],
    design: ["Design Assistant", "Prepares visual and layout suggestions. Cannot publish website changes."],
    support: ["Customer Support", "Drafts customer replies. Cannot send messages without owner approval."],
    analyst: ["Store Analyst", "Reads store data and prepares reports. Has no write or publish permission."]
  };
  const STATUSES = {
    awaiting_start_approval: "Waiting for start approval",
    approved_to_start: "Approved to start",
    in_progress: "In progress",
    awaiting_completion_approval: "Waiting for finish approval",
    completed: "Completed",
    rejected: "Rejected"
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  async function requireOwnerMfa() {
    const [userResult, aalResult] = await Promise.all([
      db.auth.getUser(), db.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);
    if (userResult.error || aalResult.error || userResult.data?.user?.id !== OWNER_UID ||
        aalResult.data?.currentLevel !== "aal2") {
      throw new Error("Owner two-step verification is required.");
    }
    return userResult.data.user;
  }

  function renderRoles() {
    const grid = document.getElementById("agentRoleGrid");
    if (!grid) return;
    grid.innerHTML = Object.entries(ROLES).map(([key, role]) => `
      <article class="agentRoleCard">
        <span class="agentRoleState">Approval only</span><h4>${escapeHtml(role[0])}</h4>
        <p>${escapeHtml(role[1])}</p><small>${key === "analyst" ? "Read-only" : "No autonomous action"}</small>
      </article>`).join("");
  }

  function taskActions(task) {
    if (task.status === "awaiting_start_approval") return `
      <button class="primary" type="button" onclick="approveAgentTaskStart(${task.id})">Approve Start</button>
      <button class="danger" type="button" onclick="rejectAgentTask(${task.id})">Reject</button>`;
    if (task.status === "approved_to_start") return `<button class="primary" type="button" onclick="startApprovedAgentTask(${task.id})">Start Approved Work</button>`;
    if (task.status === "in_progress") return `<button class="secondary" type="button" onclick="requestAgentTaskCompletion(${task.id})">Submit for Finish Approval</button>`;
    if (task.status === "awaiting_completion_approval") return `
      <button class="primary" type="button" onclick="approveAgentTaskCompletion(${task.id})">Approve Finish</button>
      <button class="secondary" type="button" onclick="returnAgentTaskToWork(${task.id})">Request Changes</button>`;
    return "";
  }

  function renderTasks(tasks) {
    const list = document.getElementById("agentTaskList");
    if (!list) return;
    if (!tasks.length) {
      list.innerHTML = '<div class="analyticsEmpty">No agent tasks yet.</div>';
      return;
    }
    list.innerHTML = tasks.map(task => `
      <article class="agentTaskCard">
        <div class="agentTaskMeta">
          <span>${escapeHtml(ROLES[task.agent_role]?.[0] || task.agent_role)}</span>
          <span class="agentRisk agentRisk--${escapeHtml(task.risk_level)}">${escapeHtml(task.risk_level)} risk</span>
          <span class="agentStatus agentStatus--${escapeHtml(task.status)}">${escapeHtml(STATUSES[task.status] || task.status)}</span>
        </div>
        <h4>${escapeHtml(task.direction)}</h4>
        ${task.result_summary ? `<p class="agentResult"><b>Work summary:</b> ${escapeHtml(task.result_summary)}</p>` : ""}
        <small>Created ${new Date(task.created_at).toLocaleString()}</small>
        <div class="agentTaskActions">${taskActions(task)}</div>
      </article>`).join("");
  }

  window.loadAgentControlCenter = async function () {
    renderRoles();
    const list = document.getElementById("agentTaskList");
    if (!list) return;
    list.innerHTML = '<div class="analyticsLoading">Loading controlled tasks…</div>';
    try {
      await requireOwnerMfa();
      const { data, error } = await db.from("agent_tasks").select("*")
        .order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      renderTasks(data || []);
    } catch (error) {
      console.error("Agent task load failed:", error);
      list.innerHTML = '<div class="analyticsEmpty">Could not load agent tasks. Owner two-step verification is required.</div>';
    }
  };

  window.createAgentTask = async function (event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = "Creating…";
    try {
      const user = await requireOwnerMfa();
      const { error } = await db.from("agent_tasks").insert({
        agent_role: form.agent_role.value,
        risk_level: form.risk_level.value,
        direction: form.direction.value.trim(),
        status: "awaiting_start_approval",
        created_by: user.id
      });
      if (error) throw error;
      form.reset(); toast("Approval request created");
      await window.loadAgentControlCenter();
    } catch (error) {
      console.error("Create agent task failed:", error);
      alert(error.message || "Could not create the approval request.");
    } finally {
      button.disabled = false; button.textContent = "Create Approval Request";
    }
  };

  async function transition(id, status, extra, message) {
    await requireOwnerMfa();
    const { error } = await db.from("agent_tasks").update({ status, ...extra }).eq("id", id);
    if (error) throw error;
    toast(message); await window.loadAgentControlCenter();
  }

  async function runTransition(id, status, extra, message) {
    try { await transition(id, status, extra, message); }
    catch (error) { console.error(error); alert(error.message || "The approval action failed."); }
  }

  window.approveAgentTaskStart = function (id) {
    if (!confirm("Approve this task to start? This does not approve completion.")) return;
    return runTransition(id, "approved_to_start", { start_approved_by: OWNER_UID, start_approved_at: new Date().toISOString() }, "Task approved to start");
  };
  window.startApprovedAgentTask = id => runTransition(id, "in_progress", { started_at: new Date().toISOString() }, "Approved task started");
  window.requestAgentTaskCompletion = function (id) {
    const result = prompt("Summarize the work that is ready for your review:");
    if (!result?.trim()) return;
    return runTransition(id, "awaiting_completion_approval", { result_summary: result.trim(), completion_requested_at: new Date().toISOString() }, "Task submitted for finish approval");
  };
  window.approveAgentTaskCompletion = function (id) {
    if (!confirm("Approve this task as finished?")) return;
    const now = new Date().toISOString();
    return runTransition(id, "completed", { completion_approved_by: OWNER_UID, completion_approved_at: now, completed_at: now }, "Task completion approved");
  };
  window.returnAgentTaskToWork = id => runTransition(id, "in_progress", { completion_requested_at: null, result_summary: null }, "Task returned for changes");
  window.rejectAgentTask = function (id) {
    if (!confirm("Reject this task before it starts?")) return;
    return runTransition(id, "rejected", { rejected_at: new Date().toISOString() }, "Task rejected");
  };
})();
