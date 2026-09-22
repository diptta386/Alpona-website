(function () {
  const OWNER_UID = "5beecdb3-5e80-4a35-9133-5fc01ab7a772";
  const BUCKET = "site-assets";
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
  const DEFAULTS = {
    id: "homepage",
    logo_url: "assets/logo.jpeg",
    logo_path: null,
    hero_image_url: "assets/decor.jpeg",
    hero_image_path: null,
    collection_image_1_url: "assets/decor.jpeg",
    collection_image_1_path: null,
    collection_image_2_url: "assets/bag.jpeg",
    collection_image_2_path: null,
    collection_image_3_url: "assets/clothing.jpeg",
    collection_image_3_path: null
  };
  const FIELDS = [
    { input: "siteLogoFile", preview: "siteLogoPreview", url: "logo_url", path: "logo_path", slot: "logo" },
    { input: "siteHeroFile", preview: "siteHeroPreview", url: "hero_image_url", path: "hero_image_path", slot: "hero" },
    { input: "siteCollection1File", preview: "siteCollection1Preview", url: "collection_image_1_url", path: "collection_image_1_path", slot: "collection-1" },
    { input: "siteCollection2File", preview: "siteCollection2Preview", url: "collection_image_2_url", path: "collection_image_2_path", slot: "collection-2" },
    { input: "siteCollection3File", preview: "siteCollection3Preview", url: "collection_image_3_url", path: "collection_image_3_path", slot: "collection-3" }
  ];

  let currentSettings = { ...DEFAULTS };

  function applyImage(id, src) {
    const image = document.getElementById(id);
    if (image && src) image.src = src;
  }

  function applySettings(settings) {
    const value = { ...DEFAULTS, ...(settings || {}) };
    applyImage("siteLogoHeader", value.logo_url);
    applyImage("siteStoryImage", value.logo_url);
    applyImage("siteHeroImage", value.hero_image_url);
    applyImage("siteCollectionImage1", value.collection_image_1_url);
    applyImage("siteCollectionImage2", value.collection_image_2_url);
    applyImage("siteCollectionImage3", value.collection_image_3_url);
  }

  async function loadSettings() {
    const { data, error } = await db
      .from("site_settings")
      .select("*")
      .eq("id", "homepage")
      .maybeSingle();

    if (error) {
      console.warn("Could not load website images:", error.message);
      return { ...DEFAULTS };
    }

    return { ...DEFAULTS, ...(data || {}) };
  }

  async function requireOwnerMfa() {
    const { data, error } = await db.auth.getUser();
    const assurance = await db.auth.mfa.getAuthenticatorAssuranceLevel();

    if (
      error ||
      data?.user?.id !== OWNER_UID ||
      assurance.error ||
      assurance.data?.currentLevel !== "aal2"
    ) {
      throw new Error("Owner two-step verification is required.");
    }
  }

  function validateFile(file) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      throw new Error("Website images must be JPG, PNG, or WebP.");
    }
    if (!file.size || file.size > MAX_FILE_SIZE) {
      throw new Error("Each website image must be smaller than 5 MB.");
    }
  }

  function extensionFor(file) {
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    return "jpg";
  }

  function renderEditor(settings) {
    currentSettings = { ...DEFAULTS, ...(settings || {}) };
    FIELDS.forEach(field => {
      const preview = document.getElementById(field.preview);
      const input = document.getElementById(field.input);
      if (preview) preview.src = currentSettings[field.url];
      if (input) input.value = "";
    });

    const status = document.getElementById("websiteEditorStatus");
    if (status) {
      status.textContent = currentSettings.updated_at
        ? `Last updated ${new Date(currentSettings.updated_at).toLocaleString()}`
        : "Using the original website images.";
    }
  }

  window.previewWebsiteAsset = function (input, previewId) {
    const file = input.files?.[0];
    const preview = document.getElementById(previewId);
    if (!file || !preview) return;

    try {
      validateFile(file);
      preview.src = URL.createObjectURL(file);
    } catch (error) {
      input.value = "";
      alert(error.message);
    }
  };

  window.loadWebsiteEditor = async function () {
    const status = document.getElementById("websiteEditorStatus");
    if (status) status.textContent = "Loading website images…";

    try {
      await requireOwnerMfa();
      renderEditor(await loadSettings());
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  };

  window.saveWebsiteSettings = async function (event) {
    event.preventDefault();
    const button = event.submitter || event.target.querySelector('button[type="submit"]');
    const uploadedPaths = [];

    try {
      await requireOwnerMfa();
      if (button) {
        button.disabled = true;
        button.textContent = "Saving…";
      }

      const next = { ...currentSettings, id: "homepage" };
      const oldPaths = [];
      let changed = false;

      for (const field of FIELDS) {
        const file = document.getElementById(field.input)?.files?.[0];
        if (!file) continue;
        validateFile(file);
        changed = true;

        const path = `homepage/${field.slot}-${Date.now()}-${crypto.randomUUID()}.${extensionFor(file)}`;
        const { error: uploadError } = await db.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPaths.push(path);

        const { data: publicData } = db.storage.from(BUCKET).getPublicUrl(path);
        if (next[field.path]) oldPaths.push(next[field.path]);
        next[field.path] = path;
        next[field.url] = publicData.publicUrl;
      }

      if (!changed) {
        throw new Error("Choose at least one image to change.");
      }

      next.updated_at = new Date().toISOString();
      const { data, error } = await db
        .from("site_settings")
        .upsert(next, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;

      if (oldPaths.length) {
        const { error: removeError } = await db.storage.from(BUCKET).remove(oldPaths);
        if (removeError) console.warn("Old website image cleanup failed:", removeError.message);
      }

      currentSettings = { ...DEFAULTS, ...data };
      applySettings(currentSettings);
      renderEditor(currentSettings);
      toast("Website images updated");
    } catch (error) {
      if (uploadedPaths.length) {
        await db.storage.from(BUCKET).remove(uploadedPaths).catch(() => {});
      }
      alert(error.message || "Could not update website images.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Save Website Images";
      }
    }
  };

  window.resetWebsiteSettings = async function () {
    if (!confirm("Restore the original Alpona logo and homepage images?")) return;

    try {
      await requireOwnerMfa();
      const oldPaths = FIELDS.map(field => currentSettings[field.path]).filter(Boolean);
      const next = { ...DEFAULTS, updated_at: new Date().toISOString() };
      const { data, error } = await db
        .from("site_settings")
        .upsert(next, { onConflict: "id" })
        .select()
        .single();
      if (error) throw error;

      if (oldPaths.length) {
        const { error: removeError } = await db.storage.from(BUCKET).remove(oldPaths);
        if (removeError) console.warn("Old website image cleanup failed:", removeError.message);
      }

      currentSettings = { ...DEFAULTS, ...data };
      applySettings(currentSettings);
      renderEditor(currentSettings);
      toast("Original website images restored");
    } catch (error) {
      alert(error.message || "Could not restore the original images.");
    }
  };

  loadSettings().then(settings => {
    currentSettings = settings;
    applySettings(settings);
  });
})();
