(function () {
  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
  const DESIGN_BUCKET = "mehendi-designs";
  const MAX_DESIGN_FILES = 3;
  const MAX_DESIGN_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_DESIGN_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const TIME_LABELS = {
    Morning: "সকাল",
    Afternoon: "দুপুর",
    Evening: "বিকাল",
    Night: "রাত"
  };

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

  function isFunctionTransportError(error) {
    const message = String(error?.message || "");
    return (
      message.includes("Failed to send a request to the Edge Function") ||
      message.includes("FunctionsFetchError") ||
      message.includes("NetworkError")
    );
  }

  async function functionErrorMessage(error, fallback) {
    if (error?.context) {
      try {
        const response = await error.context.json();
        if (response?.error) return String(response.error);
      } catch (_) {}
    }

    if (isFunctionTransportError(error)) {
      return "We could not confirm the booking response. Please check your connection and try once more; the same request will not create a duplicate booking.";
    }

    return String(error?.message || fallback);
  }

  async function invokeBookingFunction(name, body) {
    let result = await db.functions.invoke(name, { body });

    if (isFunctionTransportError(result.error)) {
      await new Promise(resolve => setTimeout(resolve, 700));
      result = await db.functions.invoke(name, { body });
    }

    return result;
  }

  function validateDesignFiles(files) {
    if (files.length > MAX_DESIGN_FILES) {
      throw new Error("You can upload up to 3 reference images.");
    }

    files.forEach(file => {
      if (!ALLOWED_DESIGN_TYPES.includes(file.type)) {
        throw new Error("Reference images must be JPG, PNG, or WebP files.");
      }
      if (!file.size || file.size > MAX_DESIGN_FILE_SIZE) {
        throw new Error("Each reference image must be smaller than 5 MB.");
      }
    });
  }

  function renderDesignLinks(paths, signedUrls) {
    if (!Array.isArray(paths) || !paths.length) {
      return '<span class="muted">No reference image</span>';
    }

    const links = paths.map((path, index) => {
      const url = signedUrls.get(path);
      if (!url) return "";
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="Open reference design ${index + 1}"><img src="${escapeHtml(url)}" alt="Customer reference design ${index + 1}" loading="lazy"></a>`;
    }).join("");

    return links
      ? `<div class="bookingDesigns">${links}</div>`
      : '<span class="muted">Image unavailable</span>';
  }

  async function refreshMehendiAvailability(eventDate) {
    const select = document.getElementById("mehendiPreferredTime");
    const help = document.getElementById("mehendiAvailabilityHelp");
    if (!select) return [];

    [...select.options].forEach(option => {
      if (!option.value) return;
      option.disabled = false;
      option.textContent = TIME_LABELS[option.value] || option.value;
    });

    if (!eventDate) {
      if (help) help.textContent = "তারিখ বেছে নিলে খালি সময়গুলো দেখা যাবে।";
      return [];
    }

    if (help) help.textContent = "খালি সময় যাচাই করা হচ্ছে…";
    const { data, error } = await db.functions.invoke(
      "mehendi-availability",
      { body: { event_date: eventDate } }
    );

    if (error || !data?.success) {
      if (help) help.textContent = "সময় যাচাই করা যায়নি। জমা দেওয়ার সময় আবার পরীক্ষা করা হবে।";
      return [];
    }

    const unavailable = Array.isArray(data.unavailable_times)
      ? data.unavailable_times
      : [];

    [...select.options].forEach(option => {
      if (!option.value || !unavailable.includes(option.value)) return;
      option.disabled = true;
      option.textContent = `${TIME_LABELS[option.value] || option.value} — বুকড`;
    });

    if (select.selectedOptions[0]?.disabled) select.value = "";
    if (help) {
      help.textContent = unavailable.length
        ? "“বুকড” সময়টি অন্য গ্রাহকের জন্য নিশ্চিত করা হয়েছে। অন্য সময় বেছে নিন।"
        : "এই তারিখে সকাল, দুপুর, বিকাল ও রাত—সব সময় খালি আছে।";
    }
    return unavailable;
  }

  window.submitMehendiBooking = async function (event) {
    event.preventDefault();

    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    const files = [...(form.elements.design_images?.files || [])];

    const date = String(fd.get("event_date") || "");

    if (!date) {
      alert("Please choose your event date.");
      return;
    }

    const selectedTime = String(fd.get("preferred_time") || "");
    const unavailable = await refreshMehendiAvailability(date);
    if (unavailable.includes(selectedTime)) {
      alert("এই তারিখ ও সময়টি ইতিমধ্যে বুকড। অন্য সময় বেছে নিন।");
      return;
    }

    try {
      validateDesignFiles(files);
    } catch (error) {
      alert(error.message);
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
      client_request_id:
        form.dataset.clientRequestId ||
        crypto.randomUUID(),
      booking_form_version: 2,
      website: String(fd.get("website") || ""),
      customer_name: String(fd.get("customer_name") || "").trim(),
      phone: String(fd.get("phone") || "").trim(),
      customer_email: String(fd.get("customer_email") || "").trim(),
      event_date: date,
      preferred_time: String(fd.get("preferred_time") || "").trim(),
      occasion: String(fd.get("occasion") || "").trim(),
      service_type: String(fd.get("service_type") || "").trim(),
      mehendi_coverage: String(fd.get("mehendi_coverage") || "").trim(),
      mehendi_side: String(fd.get("mehendi_side") || "").trim(),
      mehendi_hands: String(fd.get("mehendi_hands") || "").trim(),
      kolka_placement: String(fd.get("kolka_placement") || "").trim(),
      kolka_side: String(fd.get("kolka_side") || "").trim(),
      images: files.map(file => ({
        name: file.name,
        type: file.type,
        size: file.size
      })),
      number_of_people: Number(fd.get("number_of_people") || 1),
      venue_area: String(fd.get("venue_area") || "").trim(),
      address: String(fd.get("address") || "").trim(),
      notes: String(fd.get("notes") || "").trim()
    };

    form.dataset.clientRequestId = payload.client_request_id;

    try {
      const { data, error } = await invokeBookingFunction(
        "submit-mehendi",
        payload
      );

      if (error || !data?.success) {
        throw new Error(
          data?.error ||
          await functionErrorMessage(error, "Booking request failed.")
        );
      }

      let completed = data;

      if (data.upload_required) {
        for (const upload of data.uploads || []) {
          const file = files[Number(upload.index)];
          if (!file) throw new Error("A reference image could not be matched for upload.");

          const { error: uploadError } = await db.storage
            .from(DESIGN_BUCKET)
            .uploadToSignedUrl(upload.path, upload.token, file, {
              contentType: file.type
            });

          if (uploadError) throw uploadError;
        }

        const { data: finalData, error: finalError } = await invokeBookingFunction(
          "finalize-mehendi",
          { session_token: data.session_token }
        );

        if (finalError || !finalData?.success) {
          throw new Error(
            finalData?.error ||
            await functionErrorMessage(finalError, "Could not finish the booking request.")
          );
        }

        completed = finalData;
      }

      if (window.posthog) {
        window.posthog.capture("mehendi_booking_requested", {
          service_type: payload.service_type,
          occasion: payload.occasion
        });
      }

      form.reset();
      delete form.dataset.clientRequestId;
      updateServicePanels();

      const success =
        document.getElementById("mehendiSuccess");

      if (success) {
        success.innerHTML =
          "<strong>Request received.</strong><br>" +
          "Your booking reference is <b>" +
          escapeHtml(completed.booking_number) +
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
        .order("created_at", { ascending: true });

      if (error) throw error;

      const rows = data || [];

      if (!rows.length) {
        container.innerHTML =
          '<div class="analyticsEmpty">No Mehendi or Kolka booking requests yet.</div>';
        return;
      }

      const priorityById = new Map();
      const slotCounts = new Map();
      rows.forEach(row => {
        if (["Cancelled", "Completed"].includes(row.status)) return;
        const key = `${row.event_date}|${row.preferred_time}`;
        const priority = (slotCounts.get(key) || 0) + 1;
        slotCounts.set(key, priority);
        priorityById.set(row.id, priority);
      });

      const designPaths = [...new Set(rows.flatMap(row =>
        Array.isArray(row.custom_design_paths) ? row.custom_design_paths : []
      ))];
      const signedUrls = new Map();

      if (designPaths.length) {
        const { data: signedData, error: signedError } = await db.storage
          .from(DESIGN_BUCKET)
          .createSignedUrls(designPaths, 60 * 60);

        if (signedError) throw signedError;
        (signedData || []).forEach(item => {
          if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
        });
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
                <th>Reference</th>
                <th>Venue</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(b => `
                <tr>
                  <td>
                    <b>${escapeHtml(b.booking_number)}</b><br>
                    <span class="muted">${formatDate(b.event_date)} · ${escapeHtml(TIME_LABELS[b.preferred_time] || b.preferred_time)}</span>
                    ${priorityById.has(b.id) ? '<br><span class="bookingPriority">Priority #' + priorityById.get(b.id) + '</span>' : ''}
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
                    ${b.mehendi_side ? "<br><span class=\"muted\">" + escapeHtml(b.mehendi_side) + "</span>" : ""}\n                    ${b.mehendi_hands ? "<br><span class=\"muted\">" + escapeHtml(b.mehendi_hands) + "</span>" : ""}
                    ${b.kolka_placement ? "<br><span class=\"muted\">" + escapeHtml(b.kolka_placement) + "</span>" : ""}
                    ${b.kolka_side ? "<br><span class=\"muted\">" + escapeHtml(b.kolka_side) + "</span>" : ""}
                  </td>
                  <td>${renderDesignLinks(b.custom_design_paths, signedUrls)}</td>
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
                        "Cancelled",
                        "Slot Unavailable"
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

    const { data, error } = await db.functions.invoke(
      "update-mehendi-booking",
      { body: { booking_id: id, status } }
    );

    if (error || !data?.success) {
      console.error(
        "Mehendi status update error:",
        error || data
      );
      alert(
        data?.error ||
        (status === "Confirmed"
          ? "এই সময়টি অন্য একটি booking-এর জন্য ইতিমধ্যে confirmed।"
          : "Could not update booking status.")
      );
      await window.loadMehendiBookings();
      return;
    }

    if (data.email_error) {
      alert(data.email_error);
    } else if (status === "Confirmed" && data.email_sent) {
      toast("Booking confirmed and email sent");
    } else {
      toast("Booking updated");
    }
    await window.loadMehendiBookings();
  };

  const serviceSelect =
    document.getElementById("mehendiServiceType");
  const coveragePanel =
    document.getElementById("mehendiCoveragePanel");
  const coverageSelect =
    document.getElementById("mehendiCoverage");
  const sideSelect =
    document.getElementById("mehendiSide");
  const handsSelect =
    document.getElementById("mehendiHands");
  const kolkaPanel =
    document.getElementById("kolkaChoicePanel");
  const kolkaPlacement =
    document.getElementById("kolkaPlacement");
  const kolkaSide =
    document.getElementById("kolkaSide");
  const customUpload =
    document.getElementById("customDesignUpload");
  const designFiles =
    document.getElementById("mehendiDesignFiles");
  const fileSummary =
    document.getElementById("mehendiFileSummary");

  function updateServicePanels() {
    const value = String(serviceSelect?.value || "");
    const needsMehendi =
      value.toLowerCase().includes("mehendi");
    const needsKolka =
      value.toLowerCase().includes("kolka");

    if (coveragePanel) {
      coveragePanel.style.display = needsMehendi ? "block" : "none";
    }

    if (coverageSelect) coverageSelect.required = needsMehendi;
    if (sideSelect) sideSelect.required = needsMehendi;
    if (handsSelect) handsSelect.required = needsMehendi;

    if (kolkaPanel) {
      kolkaPanel.style.display = needsKolka ? "block" : "none";
    }
    if (kolkaPlacement) kolkaPlacement.required = needsKolka;
    if (kolkaSide) kolkaSide.required = needsKolka;
    if (customUpload) {
      customUpload.style.display = needsMehendi || needsKolka ? "block" : "none";
    }

    if (!needsMehendi) {
      if (coverageSelect) coverageSelect.value = "";
      if (sideSelect) sideSelect.value = "";
      if (handsSelect) handsSelect.value = "";
    }

    if (!needsKolka) {
      if (kolkaPlacement) kolkaPlacement.value = "";
      if (kolkaSide) kolkaSide.value = "";
    }
  }

  serviceSelect?.addEventListener(
    "change",
    updateServicePanels
  );

  designFiles?.addEventListener("change", () => {
    const files = [...(designFiles.files || [])];
    try {
      validateDesignFiles(files);
      if (fileSummary) {
        fileSummary.textContent = files.length
          ? `${files.length}টি রেফারেন্স ছবি নির্বাচিত হয়েছে।`
          : "";
      }
    } catch (error) {
      designFiles.value = "";
      if (fileSummary) fileSummary.textContent = "";
      alert(error.message);
    }
  });

  updateServicePanels();

  const dateInput =
    document.querySelector(
      '#mehendiBookingForm input[name="event_date"]'
    );

  if (dateInput) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    dateInput.min = d.toISOString().slice(0, 10);
    dateInput.addEventListener("change", () => {
      refreshMehendiAvailability(dateInput.value);
    });
  }
})();
