(function () {
  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";

  function bookingNumber() {
    return (
      "MEH-" +
      Date.now().toString().slice(-8) +
      "-" +
      Math.random().toString(36).slice(2, 5).toUpperCase()
    );
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(value) {
    if (!value) return "";
    return new Date(value + "T00:00:00").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  window.submitMehendiBooking = async function (event) {
    event.preventDefault();

    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);

    const date = String(fd.get("event_date") || "");

    if (!date) {
      alert("Please choose your event date.");
      return;
    }

    const confirmed = confirm(
      "Submit this Mehendi / Kolka appointment request?\n\n" +
      "Alpona will contact you to confirm availability and final details."
    );

    if (!confirmed) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Sending securely…";
    }

    const payload = {
      website: String(fd.get("website") || ""),
      customer_name: String(fd.get("customer_name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      customer_email: String(fd.get("customer_email") || "").trim(),
      event_date: date,
      preferred_time: String(fd.get("preferred_time") || "").trim(),
      occasion: String(fd.get("occasion") || "").trim(),
      service_type: String(fd.get("service_type") || "").trim(),
      mehendi_coverage: String(fd.get("mehendi_coverage") || "").trim(),
      mehendi_hands: String(fd.get("mehendi_hands") || "").trim(),
      number_of_people: Number(fd.get("number_of_people") || 1),
      venue_area: String(fd.get("venue_area") || "").trim(),
      address: String(fd.get("address") || "").trim(),
      notes: String(fd.get("notes") || "").trim()
    };

    try {
      const { data, error } = await db.functions.invoke(
        "submit-mehendi",
        { body: payload }
      );

      if (error || !data?.success) {
        throw new Error(
          data?.error ||
          error?.message ||
          "Booking request failed."
        );
      }

      if (window.posthog) {
        window.posthog.capture("mehendi_booking_requested", {
          service_type: payload.service_type,
          occasion: payload.occasion
        });
      }

      form.reset();

      const success =
        document.getElementById("mehendiSuccess");

      if (success) {
        success.innerHTML =
          "<strong>Request received.</strong><br>" +
          "Your booking reference is <b>" +
          escapeHtml(data.booking_number) +
          "</b>. Alpona will contact you to confirm availability.";
        success.style.display = "block";
      }

      success?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

    } catch (error) {
      console.error("Mehendi booking error:", error);
      alert(
        (error?.message || "Your booking request could not be sent.") +
        "\n\nPlease try again or contact Alpona directly."
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Request Appointment";
      }
    }
  };

  window.loadMehendiBookings = async function () {
    const container =
      document.getElementById("mehendiBookingAdmin");

    if (!container) return;

    container.innerHTML =
      '<div class="analyticsLoading">Loading Mehendi & Kolka bookings…</div>';

    try {
      const { data: sessionData } =
        await db.auth.getSession();

      if (
        !sessionData?.session?.user ||
        sessionData.session.user.id !== OWNER_UID
      ) {
        container.innerHTML =
          '<div class="analyticsEmpty">Owner login is required.</div>';
        return;
      }

      const { data, error } = await db
        .from("mehendi_bookings")
        .select("*")
        .order("event_date", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = data || [];

      if (!rows.length) {
        container.innerHTML =
          '<div class="analyticsEmpty">No Mehendi or Kolka booking requests yet.</div>';
        return;
      }

      container.innerHTML = `
        <div class="bookingSummary">
          <div><span>Total requests</span><b>${rows.length}</b></div>
          <div><span>Awaiting contact</span><b>${rows.filter(x => x.status === "Request Received").length}</b></div>
          <div><span>Confirmed</span><b>${rows.filter(x => x.status === "Confirmed").length}</b></div>
        </div>

        <div class="analyticsTableWrap">
          <table class="adminTable bookingTable">
            <thead>
              <tr>
                <th>Booking</th>
                <th>Customer</th>
                <th>Event</th>
                <th>Service</th>
                <th>Venue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(b => `
                <tr>
                  <td>
                    <b>${escapeHtml(b.booking_number)}</b><br>
                    <span class="muted">${formatDate(b.event_date)} · ${escapeHtml(b.preferred_time)}</span>
                  </td>
                  <td>
                    ${escapeHtml(b.customer_name)}<br>
                    <a href="tel:${escapeHtml(b.phone)}">${escapeHtml(b.phone)}</a>
                    ${b.customer_email ? "<br><span class=\"muted\">" + escapeHtml(b.customer_email) + "</span>" : ""}
                  </td>
                  <td>
                    ${escapeHtml(b.occasion)}<br>
                    <span class="muted">${Number(b.number_of_people || 1)} person${Number(b.number_of_people || 1) === 1 ? "" : "s"}</span>
                  </td>
                  <td>
                    ${escapeHtml(b.service_type)}
                    ${b.mehendi_coverage ? "<br><span class=\"muted\">" + escapeHtml(b.mehendi_coverage) + "</span>" : ""}
                    ${b.mehendi_hands ? "<br><span class=\"muted\">" + escapeHtml(b.mehendi_hands) + "</span>" : ""}
                  </td>
                  <td>
                    ${escapeHtml(b.venue_area)}<br>
                    <span class="muted">${escapeHtml(b.address)}</span>
                    ${b.notes ? "<br><span class=\"muted\">Note: " + escapeHtml(b.notes) + "</span>" : ""}
                  </td>
                  <td>
                    <select
                      class="statusSelect"
                      onchange="updateMehendiBookingStatus(${b.id}, this.value)"
                    >
                      ${[
                        "Request Received",
                        "Contacted",
                        "Confirmed",
                        "Completed",
                        "Cancelled"
                      ].map(status =>
                        '<option ' +
                        (b.status === status ? "selected" : "") +
                        '>' + status + '</option>'
                      ).join("")}
                    </select>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;

    } catch (error) {
      console.error("Load Mehendi bookings error:", error);
      container.innerHTML =
        '<div class="analyticsEmpty">Could not load bookings.</div>';
    }
  };

  window.updateMehendiBookingStatus =
    async function (id, status) {

    const { error } = await db
      .from("mehendi_bookings")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      console.error(
        "Mehendi status update error:",
        error
      );
      alert("Could not update booking status.");
      return;
    }

    toast("Booking updated");
    await window.loadMehendiBookings();
  };

  const serviceSelect =
    document.getElementById("mehendiServiceType");
  const coveragePanel =
    document.getElementById("mehendiCoveragePanel");
  const coverageSelect =
    document.getElementById("mehendiCoverage");
  const handsSelect =
    document.getElementById("mehendiHands");

  function updateMehendiCoverageVisibility() {
    const value = String(serviceSelect?.value || "");
    const needsMehendi =
      value.toLowerCase().includes("mehendi");

    if (coveragePanel) {
      coveragePanel.style.display = needsMehendi ? "block" : "none";
    }

    if (coverageSelect) coverageSelect.required = needsMehendi;
    if (handsSelect) handsSelect.required = needsMehendi;

    if (!needsMehendi) {
      if (coverageSelect) coverageSelect.value = "";
      if (handsSelect) handsSelect.value = "";
    }
  }

  serviceSelect?.addEventListener(
    "change",
    updateMehendiCoverageVisibility
  );

  updateMehendiCoverageVisibility();

  const dateInput =
    document.querySelector(
      '#mehendiBookingForm input[name="event_date"]'
    );

  if (dateInput) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    dateInput.min = d.toISOString().slice(0, 10);
  }
})();