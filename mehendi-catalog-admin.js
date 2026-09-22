(function () {
  const OWNER_UID="5beecdb3-5e80-4a35-9133-5fc01ab7a772", BUCKET="mehendi-catalog";
  const state={artists:[],designs:[],addons:[],zones:[]};
  const escapeHtml=value=>String(value??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
  const money=value=>"৳"+Number(value||0).toLocaleString("en-US");

  async function requireOwner(){
    const [user,aal]=await Promise.all([db.auth.getUser(),db.auth.mfa.getAuthenticatorAssuranceLevel()]);
    if(user.error||aal.error||user.data?.user?.id!==OWNER_UID||aal.data?.currentLevel!=="aal2") throw new Error("Owner two-step verification is required.");
  }
  function validFile(file){
    if(!file)return; if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>5*1024*1024) throw new Error("Use a JPG, PNG or WebP image under 5 MB.");
  }
  async function upload(file,folder){
    if(!file)return null; validFile(file);
    const ext=file.name.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g,"")||"jpg";
    const path=`${folder}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const {error}=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type,upsert:false}); if(error)throw error;
    return {path,url:db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl};
  }
  async function cleanup(path){if(path)await db.storage.from(BUCKET).remove([path]);}

  function artistOptions(){
    const options='<option value="">Choose artist</option>'+state.artists.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
    const select=document.querySelector('#designAdminForm [name="artist_id"]'); if(select){const value=select.value;select.innerHTML=options;select.value=value;}
  }
  function status(active){return active?'<span class="catalogLive">Live</span>':'<span class="catalogHidden">Hidden</span>';}
  function render(){
    artistOptions(); const root=document.getElementById("mehendiCatalogAdminList"); if(!root)return;
    root.innerHTML=`
      <section class="catalogAdminListSection"><h4>Artists</h4>${state.artists.length?state.artists.map(x=>`<div class="catalogAdminRow"><div>${x.photo_url?`<img src="${escapeHtml(x.photo_url)}" alt="">`:""}<span><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.base_area)} · ${escapeHtml(x.public_address)}</small></span></div><div>${status(x.active)}<button class="secondary" onclick="editCatalogRecord('artist','${x.id}')">Edit</button></div></div>`).join(""):'<p class="analyticsEmpty">No artists yet.</p>'}</section>
      <section class="catalogAdminListSection"><h4>Designs &amp; Services</h4>${state.designs.length?state.designs.map(x=>`<div class="catalogAdminRow"><div>${x.image_url?`<img src="${escapeHtml(x.image_url)}" alt="">`:""}<span><b>${escapeHtml(x.title)}</b><small>${escapeHtml(state.artists.find(a=>a.id===x.artist_id)?.name||"Unknown artist")} · ${money(x.price)} ${x.pricing_unit==="per_person"?"per person":"per booking"}</small></span></div><div>${status(x.active)}<button class="secondary" onclick="editCatalogRecord('design','${x.id}')">Edit</button></div></div>`).join(""):'<p class="analyticsEmpty">No designs yet.</p>'}</section>
      <section class="catalogAdminListSection"><h4>Organic Mehendi / Add-ons</h4>${state.addons.length?state.addons.map(x=>`<div class="catalogAdminRow"><div>${x.image_url?`<img src="${escapeHtml(x.image_url)}" alt="">`:""}<span><b>${escapeHtml(x.name)}</b><small>${money(x.price)} / ${escapeHtml(x.unit_label)}</small></span></div><div>${status(x.active)}<button class="secondary" onclick="editCatalogRecord('addon','${x.id}')">Edit</button></div></div>`).join(""):'<p class="analyticsEmpty">No add-ons yet.</p>'}</section>
      <section class="catalogAdminListSection"><h4>Travel Zones</h4>${state.zones.length?state.zones.map(x=>`<div class="catalogAdminRow"><div><span><b>${escapeHtml(x.label)}</b><small>${Number(x.min_km)}–${Number(x.max_km)} km · ${money(x.fee)}</small></span></div><div>${status(x.active)}<button class="secondary" onclick="editCatalogRecord('zone','${x.id}')">Edit</button></div></div>`).join(""):'<p class="analyticsEmpty">No zones yet.</p>'}</section>`;
  }

  window.loadMehendiCatalogAdmin=async function(){
    const root=document.getElementById("mehendiCatalogAdminList"); if(root)root.innerHTML='<div class="analyticsLoading">Loading catalog settings…</div>';
    try{await requireOwner();const results=await Promise.all([
      db.from("mehendi_artists").select("*").order("sort_order"),db.from("mehendi_catalog_items").select("*").order("sort_order"),
      db.from("mehendi_addons").select("*").order("sort_order"),db.from("mehendi_travel_zones").select("*").order("sort_order")]);
      const failed=results.find(x=>x.error)?.error;if(failed)throw failed;[state.artists,state.designs,state.addons,state.zones]=results.map(x=>x.data||[]);render();
    }catch(error){console.error(error);if(root)root.innerHTML='<div class="analyticsEmpty">Could not load the artist catalog manager.</div>';}
  };

  window.resetCatalogAdminForm=function(id){const form=document.getElementById(id);form?.reset();form?.querySelectorAll('input[type="hidden"]').forEach(x=>x.value="");artistOptions();};
  window.editCatalogRecord=function(type,id){
    const map={artist:[state.artists,"artistAdminForm"],design:[state.designs,"designAdminForm"],addon:[state.addons,"addonAdminForm"],zone:[state.zones,"zoneAdminForm"]};
    const [rows,formId]=map[type]||[];const row=rows?.find(x=>String(x.id)===String(id));const form=document.getElementById(formId);if(!row||!form)return;
    Object.entries(row).forEach(([key,value])=>{const field=form.elements[key];if(!field)return;if(field.type==="checkbox")field.checked=Boolean(value);else if(field.type!=="file")field.value=value??"";});
    form.scrollIntoView({behavior:"smooth",block:"start"});
  };

  async function saveWithImage(form,table,folder,imageField,urlField,pathField,payload){
    await requireOwner();const file=form.elements[imageField]?.files?.[0];const oldPath=form.elements[pathField]?.value||null;let uploaded=null;
    try{uploaded=await upload(file,folder);if(uploaded){payload[urlField]=uploaded.url;payload[pathField]=uploaded.path;}else{payload[urlField]=form.elements[urlField]?.value||null;payload[pathField]=oldPath;}
      payload.updated_at=new Date().toISOString();const id=form.elements.id.value;if(id)payload.id=id;
      const {error}=await db.from(table).upsert(payload);if(error)throw error;if(uploaded&&oldPath&&oldPath!==uploaded.path)await cleanup(oldPath);
      form.reset();form.querySelectorAll('input[type="hidden"]').forEach(x=>x.value="");toast("Catalog saved");await window.loadMehendiCatalogAdmin();
    }catch(error){if(uploaded)await cleanup(uploaded.path);throw error;}
  }
  function fail(error){console.error(error);alert(error.message||"Could not save catalog settings.");}

  window.saveMehendiArtist=async event=>{event.preventDefault();const f=event.currentTarget,e=f.elements;try{await saveWithImage(f,"mehendi_artists","artists","photo","photo_url","photo_path",{name:e.name.value.trim(),public_address:e.public_address.value.trim(),base_area:e.base_area.value.trim(),bio:e.bio.value.trim()||null,active:e.active.checked});}catch(error){fail(error);}};
  window.saveMehendiDesign=async event=>{event.preventDefault();const f=event.currentTarget,e=f.elements;try{await saveWithImage(f,"mehendi_catalog_items","designs","image","image_url","image_path",{artist_id:e.artist_id.value,title:e.title.value.trim(),service_type:e.service_type.value,price:Number(e.price.value),pricing_unit:e.pricing_unit.value,duration_minutes:e.duration_minutes.value?Number(e.duration_minutes.value):null,description:e.description.value.trim()||null,active:e.active.checked});}catch(error){fail(error);}};
  window.saveMehendiAddon=async event=>{event.preventDefault();const f=event.currentTarget,e=f.elements;try{await saveWithImage(f,"mehendi_addons","addons","image","image_url","image_path",{name:e.name.value.trim(),price:Number(e.price.value),unit_label:e.unit_label.value.trim(),description:e.description.value.trim()||null,active:e.active.checked});}catch(error){fail(error);}};
  window.saveMehendiTravelZone=async event=>{event.preventDefault();const f=event.currentTarget,e=f.elements;try{await requireOwner();const payload={label:e.label.value.trim(),min_km:Number(e.min_km.value),max_km:Number(e.max_km.value),fee:Number(e.fee.value),active:e.active.checked,updated_at:new Date().toISOString()};if(e.id.value)payload.id=Number(e.id.value);const {error}=await db.from("mehendi_travel_zones").upsert(payload);if(error)throw error;f.reset();toast("Travel zone saved");await window.loadMehendiCatalogAdmin();}catch(error){fail(error);}};
})();
