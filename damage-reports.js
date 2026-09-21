(function () {
  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
  const BUCKET = "damage-reports";

  function reportNumber() {
    return (
      "ALP-CLM-" +
      Date.now().toString().slice(-8) +
      "-" +
      Math.random().toString(36).slice(2, 5).toUpperCase()
    );
  }

  function safeName(fileName) {
    return String(fileName || "file")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .slice(-90);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function uploadEvidence(path, file) {
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type
      });

    if (error) throw error;
    return path;
  }

  window.submitDamageReport = async function (event) {
    event.preventDefault();

    const form = event.target;
    const button = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);

    const video = form.elements["unboxing_video"]?.files?.[0];
    const photos = Array.from(
      form.elements["damage_photos"]?.files || []
    );

    if (!video) {
      alert(
        "A full unboxing video is required for a damage claim."
      );
      return;
    }

    const allowedVideoTypes = [
      "video/mp4",
      "video/quicktime",
      "video/webm"
    ];

    if (!allowedVideoTypes.includes(video.type)) {
      alert(
        "Please upload the unboxing video as MP4, MOV, or WebM."
      );
      return;
    }

    if (video.size > 100 * 1024 * 1024) {
      alert(
        "The video is larger than 100 MB. Please reduce the file size and try again."
      );
      return;
    }

    if (photos.length > 5) {
      alert("You can upload up to 5 supporting photos.");
      return;
    }

    for (const photo of photos) {
      if (!["image/jpeg","image/png","image/webp"].includes(photo.type)) {
        alert("Supporting photos must be JPG, PNG, or WebP.");
        return;
      }

      if (photo.size > 10 * 1024 * 1024) {
        alert("Each supporting photo must be 10 MB or smaller.");
        return;
      }
    }

    if (!fd.get("policy_accepted")) {
      alert(
        "Please read and accept the Damage Claim Policy before submitting."
      );
      return;
    }

    const confirmed = confirm(
      "Submit this damage report?\n\n" +
      "Your full unboxing video will be reviewed by Alpona. " +
      "Submitting a report does not automatically approve a refund."
    );

    if (!confirmed) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Uploading evidence…";
    }

    const claimNumber = reportNumber();
    const folder =
      "claims/" +
      claimNumber +
      "-" +
      crypto.randomUUID();

    const uploadedPaths = [];

    try {
      const videoPath =
        folder +
        "/unboxing-" +
        safeName(video.name);

      await uploadEvidence(videoPath, video);
      uploadedPaths.push(videoPath);

      const photoPaths = [];

      for (let i = 0; i < photos.length; i++) {
        const path =
          folder +
          "/photo-" +
          (i + 1) +
          "-" +
          safeName(photos[i].name);

        await uploadEvidence(path, photos[i]);
        uploadedPaths.push(path);
        photoPaths.push(path);
      }

      const { error } = await db
        .from("damage_reports")
        .insert({
          report_number: claimNumber,
          order_number:
            String(fd.get("order_number") || "").trim(),
          customer_name:
            String(fd.get("customer_name") || "").trim(),
          phone:
            String(fd.get("phone") || "").trim(),
          customer_email:
            String(fd.get("customer_email") || "").trim() || null,
          issue_type:
            String(fd.get("issue_type") || "").trim(),
          description:
            String(fd.get("description") || "").trim(),
          video_path: videoPath,
          photo_paths: photoPaths,
          policy_accepted: true,
          status: "Submitted"
        });

      if (error) throw error;

      if (window.posthog) {
        window.posthog.capture("damage_report_submitted", {
          issue_type: String(fd.get("issue_type") || ""),
          has_photos: photos.length > 0
        });
      }

      form.reset();

      const success =
        document.getElementById("damageReportSuccess");

      if (success) {
        success.innerHTML =
          "<strong>Damage report submitted.</strong><br>" +
          "Reference: <b>" +
          escapeHtml(claimNumber) +
          "</b><br>" +
          "Alpona will review the unboxing video and contact you. " +
          "Do not send the damaged product back unless Alpona specifically asks you to.";
        success.style.display = "block";
      }

      success?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

    } catch (error) {
      console.error("Damage report error:", error);

      for (const path of uploadedPaths) {
        try {
          await db.storage
            .from(BUCKET)
            .remove([path]);
        } catch (_) {}
      }

      alert(
        "Your damage report could not be submitted. Please try again, or contact Alpona through Facebook or Instagram."
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Submit Damage Report";
      }
    }
  };

  async function signedUrl(path) {
    if (!path) return null;

    const { data, error } = await db.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);

    if (error) {
      console.error("Evidence link error:", error);
      return null;
    }

    return data?.signedUrl || null;
  }

  window.loadDamageReports = async function () {
    const container =
      document.getElementById("damageReportsAdmin");

    if (!container) return;

    container.innerHTML =
      '<div class="analyticsLoading">Loading damage reports…</div>';

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
        .from("damage_reports")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const reports = data || [];

      if (!reports.length) {
        container.innerHTML =
          '<div class="analyticsEmpty">No damage reports yet.</div>';
        return;
      }

      const hydrated = [];

      for (const report of reports) {
        const videoUrl =
          await signedUrl(report.video_path);

        const photoUrls = [];

        for (const path of report.photo_paths || []) {
          const url = await signedUrl(path);
          if (url) photoUrls.push(url);
        }

        hydrated.push({
          ...report,
          videoUrl,
          photoUrls
        });
      }

      container.innerHTML = `
        <div class="bookingSummary">
          <div><span>Total reports</span><b>${reports.length}</b></div>
          <div><span>Needs review</span><b>${reports.filter(r => ["Submitted","Reviewing"].includes(r.status)).length}</b></div>
          <div><span>Refunded</span><b>${reports.filter(r => r.status === "Refund Sent").length}</b></div>
        </div>

        <div class="damageAdminList">
          ${hydrated.map(r => `
            <article class="damageAdminCard">
              <div class="damageAdminTop">
                <div>
                  <span class="claimStatus">${escapeHtml(r.status)}</span>
                  <h4>${escapeHtml(r.report_number)}</h4>
                  <p>Order: <b>${escapeHtml(r.order_number)}</b> · ${new Date(r.created_at).toLocaleString()}</p>
                </div>

                <select
                  class="statusSelect"
                  onchange="updateDamageReportStatus(${r.id}, this.value)"
                >
                  ${[
                    "Submitted",
                    "Reviewing",
                    "Approved for Refund",
                    "Refund Sent",
                    "Rejected"
                  ].map(status =>
                    '<option ' +
                    (r.status === status ? "selected" : "") +
                    '>' +
                    status +
                    '</option>'
                  ).join("")}
                </select>
              </div>

              <div class="damageAdminGrid">
                <div>
                  <b>Customer</b>
                  <p>
                    ${escapeHtml(r.customer_name)}<br>
                    <a href="tel:${escapeHtml(r.phone)}">${escapeHtml(r.phone)}</a>
                    ${r.customer_email ? "<br>" + escapeHtml(r.customer_email) : ""}
                  </p>
                </div>

                <div>
                  <b>Issue</b>
                  <p>${escapeHtml(r.issue_type)}<br>${escapeHtml(r.description)}</p>
                </div>
              </div>

              <div class="damageEvidenceLinks">
                ${r.videoUrl
                  ? '<a class="primary" target="_blank" rel="noopener noreferrer" href="' + r.videoUrl + '">Watch Unboxing Video</a>'
                  : '<span class="muted">Video link unavailable</span>'
                }

                ${r.photoUrls.map((url, index) =>
                  '<a class="secondary" target="_blank" rel="noopener noreferrer" href="' +
                  url +
                  '">Photo ' +
                  (index + 1) +
                  '</a>'
                ).join("")}
              </div>

              <label class="damageOwnerNote">
                Owner Note
                <textarea
                  id="damage-note-${r.id}"
                  placeholder="Reason for approval/rejection, refund note..."
                >${escapeHtml(r.owner_note || "")}</textarea>
              </label>

              <button
                class="secondary"
                onclick="saveDamageOwnerNote(${r.id})"
              >Save Note</button>
            </article>
          `).join("")}
        </div>
      `;

    } catch (error) {
      console.error("Load damage reports error:", error);
      container.innerHTML =
        '<div class="analyticsEmpty">Could not load damage reports.</div>';
    }
  };

  window.updateDamageReportStatus =
    async function (id, status) {

    const { error } = await db
      .from("damage_reports")
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      console.error("Damage report status error:", error);
      alert("Could not update the report.");
      return;
    }

    toast("Damage report updated");
    await window.loadDamageReports();
  };

  window.saveDamageOwnerNote =
    async function (id) {

    const note =
      document.getElementById(
        "damage-note-" + id
      )?.value || "";

    const { error } = await db
      .from("damage_reports")
      .update({
        owner_note: note.trim() || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      console.error("Damage report note error:", error);
      alert("Could not save note.");
      return;
    }

    toast("Note saved");
  };
})();