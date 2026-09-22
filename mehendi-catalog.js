(function () {
  const state = { artists: [], items: [], zones: [], addons: [] };
  const money = value => "৳" + Number(value || 0).toLocaleString("en-US");
  const escapeHtml = value => String(value ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const byId = (rows, id) => rows.find(row => String(row.id) === String(id));

  function selected() {
    const artist = byId(state.artists, document.getElementById("catalogArtistSelect").value);
    const item = byId(state.items, document.getElementById("catalogDesignSelect").value);
    const zone = byId(state.zones, document.getElementById("catalogZoneSelect").value);
    const addon = byId(state.addons, document.getElementById("catalogAddonSelect").value);
    const people = Math.max(1, Math.min(100, Number(document.getElementById("catalogPeople").value || 1)));
    const quantity = addon ? Math.max(1, Math.min(100, Number(document.getElementById("catalogAddonQuantity").value || 1))) : 0;
    return { artist, item, zone, addon, people, quantity };
  }

  function updatePrice() {
    const choice = selected();
    const design = choice.item ? Number(choice.item.price) * (choice.item.pricing_unit === "per_person" ? choice.people : 1) : 0;
    const travel = choice.zone ? Number(choice.zone.fee) : 0;
    const addon = choice.addon ? Number(choice.addon.price) * choice.quantity : 0;
    document.getElementById("catalogDesignPrice").textContent = money(design);
    document.getElementById("catalogTravelPrice").textContent = money(travel);
    document.getElementById("catalogAddonPrice").textContent = money(addon);
    document.getElementById("catalogTotal").textContent = money(design + travel + addon);
    document.getElementById("catalogAddonQuantityWrap").style.display = choice.addon ? "block" : "none";
    document.getElementById("catalogContinue").disabled = !(choice.artist && choice.item && choice.zone && choice.item.artist_id === choice.artist.id);
  }

  function populateDesigns(artistId) {
    const select = document.getElementById("catalogDesignSelect");
    const items = state.items.filter(item => item.artist_id === artistId);
    select.innerHTML = '<option value="">Choose design</option>' + items.map(item =>
      `<option value="${escapeHtml(item.id)}">${escapeHtml(item.title)} — ${money(item.price)}${item.pricing_unit === "per_person" ? " / person" : ""}</option>`
    ).join("");
    select.disabled = !artistId || !items.length;
    updatePrice();
  }

  window.chooseCatalogDesign = function (artistId, itemId) {
    document.getElementById("catalogArtistSelect").value = artistId;
    populateDesigns(artistId);
    document.getElementById("catalogDesignSelect").value = itemId;
    updatePrice();
    document.querySelector(".catalogBuilder")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function renderCatalog() {
    const container = document.getElementById("artistCatalog");
    const status = document.getElementById("catalogStatus");
    if (!state.artists.length) {
      status.className = "analyticsEmpty";
      status.textContent = "Artist catalog is being prepared. Please use the appointment request form for now.";
      return;
    }
    status.style.display = "none";
    container.innerHTML = state.artists.map(artist => {
      const items = state.items.filter(item => item.artist_id === artist.id);
      return `<article class="artistCatalogCard">
        ${artist.photo_url ? `<img class="artistPortrait" src="${escapeHtml(artist.photo_url)}" alt="${escapeHtml(artist.name)}" loading="lazy">` : '<div class="artistPortrait artistPortrait--empty">Alpona Artist</div>'}
        <div class="artistInfo"><p class="kicker">${escapeHtml(artist.base_area)}</p><h3>${escapeHtml(artist.name)}</h3><p>${escapeHtml(artist.public_address)}</p>${artist.bio ? `<p class="artistBio">${escapeHtml(artist.bio)}</p>` : ""}</div>
        <div class="artistDesignGrid">${items.length ? items.map(item => `<button type="button" class="artistDesignCard" onclick="chooseCatalogDesign('${escapeHtml(artist.id)}','${escapeHtml(item.id)}')">
          ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy">` : '<span class="designImageEmpty">Design image</span>'}
          <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.service_type)} · ${money(item.price)}${item.pricing_unit === "per_person" ? " / person" : ""}</small></span>
        </button>`).join("") : '<p class="analyticsEmpty">No active designs yet.</p>'}</div>
      </article>`;
    }).join("");
  }

  async function loadCatalog() {
    const results = await Promise.all([
      db.from("mehendi_artists").select("*").eq("active",true).order("sort_order"),
      db.from("mehendi_catalog_items").select("*").eq("active",true).order("sort_order"),
      db.from("mehendi_travel_zones").select("*").eq("active",true).order("sort_order"),
      db.from("mehendi_addons").select("*").eq("active",true).order("sort_order")
    ]);
    const failed = results.find(result => result.error)?.error;
    if (failed) throw failed;
    [state.artists,state.items,state.zones,state.addons] = results.map(result => result.data || []);
    document.getElementById("catalogArtistSelect").innerHTML = '<option value="">Choose artist</option>' + state.artists.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)} — ${escapeHtml(row.base_area)}</option>`).join("");
    document.getElementById("catalogZoneSelect").innerHTML = '<option value="">Choose distance zone</option>' + state.zones.map(row => `<option value="${row.id}">${escapeHtml(row.label)} — ${money(row.fee)}</option>`).join("");
    document.getElementById("catalogAddonSelect").innerHTML = '<option value="">No add-on</option>' + state.addons.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.name)} — ${money(row.price)} / ${escapeHtml(row.unit_label)}</option>`).join("");
    renderCatalog(); updatePrice();
  }

  document.getElementById("catalogArtistSelect").addEventListener("change", event => populateDesigns(event.target.value));
  ["catalogDesignSelect","catalogZoneSelect","catalogAddonSelect","catalogPeople","catalogAddonQuantity"].forEach(id => document.getElementById(id).addEventListener("change", updatePrice));
  document.getElementById("catalogContinue").addEventListener("click", () => {
    const choice = selected();
    if (!(choice.artist && choice.item && choice.zone)) return;
    const params = new URLSearchParams({ catalog:"1", artist:choice.artist.id, design:choice.item.id, zone:String(choice.zone.id), people:String(choice.people) });
    if (choice.addon) { params.set("addon",choice.addon.id); params.set("addon_qty",String(choice.quantity)); }
    location.href = "index.html?" + params.toString() + "#mehendi";
  });
  loadCatalog().catch(error => {
    console.error("Catalog load failed:",error);
    const status=document.getElementById("catalogStatus"); status.className="analyticsEmpty"; status.textContent="The artist catalog could not be loaded right now.";
  });
})();
