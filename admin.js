(() => {
  let accessToken = null;
  const loginPanel = document.getElementById("loginPanel");
  const dashboardPanel = document.getElementById("dashboardPanel");
  const loginForm = document.getElementById("loginForm");
  const loginMsg = document.getElementById("loginMsg");
  const adminUser = document.getElementById("adminUser");
  const logoutBtn = document.getElementById("logoutBtn");
  const bikeForm = document.getElementById("bikeForm");
  const bikeMsg = document.getElementById("bikeMsg");
  const bikeList = document.getElementById("bikeList");
  const saveBikeBtn = document.getElementById("saveBikeBtn");
  const bikeDetailsPanel = document.getElementById("bikeDetailsPanel");
  const editBikeForm = document.getElementById("editBikeForm");
  const updateBikeBtn = document.getElementById("updateBikeBtn");
  const detailMsg = document.getElementById("detailMsg");

  const tabs = [...(document.querySelectorAll?.('[role="tab"]') || [])];
  function selectTab(tab) {
    for (const item of tabs) {
      const active = item === tab;
      item.classList.toggle("active", active);
      item.setAttribute("aria-selected", String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute("aria-controls")).hidden = !active;
    }
    window.dispatchEvent?.(new Event("bk-admin-tab"));
    if(tab.id==="tab-winners")loadWinners();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", event => {
      const visible = tabs.filter(item => !item.hidden && !item.classList.contains("outside-page"));
      const current = visible.indexOf(tab);
      let next;
      if (event.key === "ArrowRight") next = (current + 1) % visible.length;
      if (event.key === "ArrowLeft") next = (current + visible.length - 1) % visible.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = visible.length - 1;
      if (next == null) return;
      event.preventDefault(); selectTab(visible[next]); visible[next].focus();
    });
  });
  function showDashboard(user) {
    window.bkAdminPermissions=[];
    hideDetailsPanel();
    for(const key of ["finance","handover","documents","costs","reports","activity","staff","backups","purchases","executives","movement","purchasework","documentswork","mechanicwork"]){const body=document.getElementById(key+"Body");if(body)body.innerHTML="";}
    document.querySelector?.(".admin-shell")?.classList.add("is-dashboard");
    loginPanel.classList.remove("active");
    dashboardPanel.classList.add("active");
    adminUser.textContent = `${user.full_name || user.email} • Administrator`;
    loadBikes();
    window.dispatchEvent?.(new Event("bk-admin-ready"));
  }
  function showLogin(message = "") {
    window.dispatchEvent?.(new Event("bk-admin-signed-out"));
    document.querySelector?.(".admin-shell")?.classList.remove("is-dashboard");
    accessToken = null;
    window.bkAdminPermissions=[];
    hideDetailsPanel();
    bikeList.innerHTML="";
    for(const key of ["finance","handover","documents","costs","reports","activity","staff","backups","purchases","executives","movement","purchasework","documentswork","mechanicwork"]){const body=document.getElementById(key+"Body");if(body)body.innerHTML="";}
    dashboardPanel.classList.remove("active");
    loginPanel.classList.add("active");
    loginMsg.textContent = message;
  }
  async function login(email, password) {
    const res = await fetch("/api/auth/login", {method:"POST",headers:{"Content-Type":"application/json"},credentials:"include",body:JSON.stringify({email,password})});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (!data.user || data.user.role !== "admin") {
      await fetch("/api/auth/logout", {method:"POST",credentials:"include"});
      throw new Error("This login is not an administrator account");
    }
    accessToken = data.accessToken;
    return data.user;
  }
  async function verifyAdmin() {
    if (!accessToken) return false;
    const res = await fetch("/api/admin/ping", {headers:{Authorization:`Bearer ${accessToken}`},credentials:"include"});
    return res.ok;
  }
  async function refreshSession() {
    const res = await fetch("/api/auth/refresh", {method:"POST",credentials:"include"});
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    if (!data.accessToken) return false;
    accessToken = data.accessToken;
    return true;
  }
  let refreshing = null;
  async function api(url, options={}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${accessToken}`);
    const send = () => fetch(url, {...options, headers, credentials:"include"});
    let res = await send();
    if (res.status === 401) {
      if (!refreshing) refreshing = refreshSession().finally(() => { refreshing = null; });
      if (await refreshing) {
        headers.set("Authorization", `Bearer ${accessToken}`);
        res = await send();
      } else showLogin("Your session expired. Please log in again.");
    }
    return res;
  }
  window.bkAdminApi = api;
  function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  function setValue(id, value) { document.getElementById(id).value = value ?? ""; }
  function showDetailsPanel() { bikeDetailsPanel.classList.add("active"); bikeDetailsPanel.scrollIntoView({behavior:"smooth", block:"start"}); }
  function hideDetailsPanel() { bikeDetailsPanel.classList.remove("active"); detailMsg.textContent = ""; editBikeForm.reset(); }
  async function openBikeDetails(id) {
    detailMsg.textContent = "Loading…";
    showDetailsPanel();
    try {
      const res = await api(`/api/admin/bikes/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load bike");
      const b = data.bike;
      const profile=typeof b.detail_profile==='string'?JSON.parse(b.detail_profile):b.detail_profile||{};
      for(const key of ["engineNumber", "chassisNumber", "registrationDate", "inspectionNotes", "registrationYear", "hpStatus", "nocStatus", "rcAvailable", "keysCount", "insuranceStatus", "engineNoise", "smoke", "selfStart", "clutchPlate", "timingChainNoise", "engineCondition", "batteryWorking", "chassis", "bodyLine", "vehicleRating"])setValue("edit"+key[0].toUpperCase()+key.slice(1),profile[key]);
      setValue("editBikeId", b.id); setValue("editBrand", b.brand); setValue("editModel", b.model);
      setValue("editYear", b.year); setValue("editRegistrationNumber", b.registration_number);
      setValue("editKilometersDriven", b.kilometers_driven); setValue("editOwnershipCount", b.ownership_count);
      document.getElementById('deliveryPhoto').value='';document.getElementById('saleReceipt').value='';
      document.getElementById('saleDocuments').innerHTML=(b.sale_profile?.documents||[]).map(d=>`<p><button type="button" data-evidence-bike="${esc(b.id)}" data-evidence-file="${esc(d.filename)}">View ${d.kind==='deliveryPhoto'?'delivery photo':'sale receipt'}</button> · ${esc(d.uploadedAt||'')}</p>`).join('');
      for(const key of saleKeys)setValue("sale"+key[0].toUpperCase()+key.slice(1),b.sale_profile?.[key]);
      setValue("editFuelType", b.fuel_type); setValue("editStatus", b.status); setValue("editConditionNotes", b.condition_notes);
      window.dispatchEvent?.(new CustomEvent("bk-admin-bike",{detail:b}));
      document.getElementById("detailsTitle").textContent = `${b.brand} ${b.model}`;
      document.getElementById("detailsSub").textContent = `Bike #${b.id} • ${b.status || "draft"}${b.purchase_source?" · Inspected by "+b.purchase_source.executive_name+" · "+b.purchase_source.inspection_at+" UTC":""}`;
      let sourceButton=document.getElementById("viewPurchaseSource");if(sourceButton?.remove)sourceButton.remove();if(b.purchase_source){sourceButton=document.createElement("button");sourceButton.id="viewPurchaseSource";sourceButton.type="button";sourceButton.textContent="View original purchase / inspection record";sourceButton.addEventListener("click",()=>window.bkOpenPurchase?.(b.purchase_source.id));document.getElementById("detailsSub").after(sourceButton);}
      const photos = document.getElementById("existingPhotos");
      photos.innerHTML = b.images?.length ? b.images.map(img => `<img src="${esc(img.image_url)}" alt="Bike photo">`).join("") : `<div class="details-note">No bike photos uploaded.</div>`;
      const rc = document.getElementById("rcCurrent");
      rc.innerHTML = b.rc_document_url ? `<button type="button" class="admin-secondary" id="viewRcBtn">View RC document</button>` : "No RC document uploaded.";
      document.getElementById("viewRcBtn")?.addEventListener("click", async () => {
        const viewer = window.open("about:blank", "_blank");
        if (viewer) viewer.opener = null;
        try {
          const response = await api(`/api/admin/bikes/${encodeURIComponent(b.id)}/rc`);
          if (!response.ok) throw new Error("Could not open RC document");
          const url = URL.createObjectURL(await response.blob());
          if (viewer) viewer.location.href = url;
          else { const link = document.createElement("a"); link.href = url; link.download = "RC-document"; link.click(); }
        } catch (err) { viewer?.close(); detailMsg.textContent = err.message; }
      });
      document.getElementById("editBikePhotos").value = "";
      document.getElementById("editRcDocument").value = "";
      detailMsg.textContent = "";
    } catch (e) { detailMsg.textContent = e.message; }
  }
  const saleKeys=["buyerName", "buyerBusiness", "buyerPhone", "buyerEmail", "saleDate", "deliveryDate", "salePrice", "paymentReceived", "paymentMethod", "paymentDate", "paymentReference"];
  let inventoryQuery="";
  document.getElementById("inventorySearchForm").addEventListener("submit",e=>{e.preventDefault();inventoryQuery=document.getElementById("inventorySearch").value.trim();bikePage=1;loadBikes();});
  document.getElementById("inventoryClear").addEventListener("click",()=>{document.getElementById("inventorySearch").value="";inventoryQuery="";bikePage=1;loadBikes();});
  let bikePage=1;
  async function loadBikes() {
    bikeList.textContent = "Loading…";
    try {
      const res = await api("/api/admin/bikes?page="+bikePage+"&pageSize=20&search="+encodeURIComponent(inventoryQuery));
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load bikes");
      if(document.getElementById("bikePage")){document.getElementById("bikePage").textContent=`Page ${bikePage} of ${Math.max(1,Math.ceil(Number(data.total)/20))}`;document.getElementById("bikePrev").disabled=bikePage===1;document.getElementById("bikeNext").disabled=bikePage*20>=Number(data.total);}
      if (!data.rows?.length) { bikeList.innerHTML = '<div class="empty-state">No matching bikes.</div>'; return; }
      bikeList.innerHTML = data.rows.map(b => `
        <article class="inventory-card"><div class="bike-row" data-bike-id="${esc(b.id)}">
          ${b.cover_image ? `<img class="bike-thumb" src="${esc(b.cover_image)}" alt="">` : `<div class="bike-thumb"></div>`}
          <div class="bike-meta"><b>#${esc(b.id)} · ${esc(b.brand)} ${esc(b.model)}</b><small>${esc(b.year)}${b.registration_number ? ` · ${esc(b.registration_number)}` : ""}</small></div>
          <div class="bike-meta"><small>${b.kilometers_driven != null ? `${esc(b.kilometers_driven)} km` : "KM not added"}</small></div>
          <div><span class="status-pill">${esc(b.status)}</span></div>
          <div><button class="view-btn" type="button" data-view-bike="${esc(b.id)}">VIEW / EDIT</button></div>
        </div><div class="inventory-sale" ${window.bkAdminPermissions&&!window.bkAdminPermissions.includes("owner")?"hidden":""}>
          <div><small>Recorded buyer</small>${esc(b.sale_profile?.buyerName||'Not recorded')}<br>${esc(b.sale_profile?.buyerBusiness||'')}<br>${esc(b.sale_profile?.buyerPhone||'')} ${esc(b.sale_profile?.buyerEmail||'')}</div>
          <div><small>Auction winner / dealer</small>${esc(b.buyer_name||'Not recorded')}<br>${esc(b.buyer_business||'')}<br>${esc(b.buyer_phone||'')} ${esc(b.buyer_email||'')}</div>
          <div><small>Sale date / delivered on</small>${esc(b.sale_profile?.saleDate||'Not recorded')} / ${esc(b.sale_profile?.deliveryDate||'Not recorded')}</div>
          <div><small>Sale price / payment received (₹)</small>${esc(b.sale_profile?.salePrice??'Not recorded')} / ${esc(b.sale_profile?.paymentReceived??'Not recorded')}</div>
          <div><small>Payment method / date</small>${esc(b.sale_profile?.paymentMethod||'Not recorded')} / ${esc(b.sale_profile?.paymentDate||'Not recorded')}</div>
          <div><small>Payment status / balance due (₹)</small>${esc(b.financial?.paymentStatus||"Not recorded")} / ${b.financial?.balance==null?"Not recorded":esc((b.financial.balance/100).toFixed(2))}</div><div><small>Total cost / profit (₹)</small>${b.financial?.totalCost==null?"Not recorded":esc((b.financial.totalCost/100).toFixed(2))} / ${b.financial?.profit==null?"Not recorded":esc((b.financial.profit/100).toFixed(2))}</div><div><small>Payment reference</small>${esc(b.sale_profile?.paymentReference||'Not recorded')}</div>
          <div><small>Delivery / sale evidence</small>${(b.sale_profile?.documents||[]).map(d=>`<button type="button" data-evidence-bike="${esc(b.id)}" data-evidence-file="${esc(d.filename)}">${d.kind==='deliveryPhoto'?'Delivery photo':'Sale receipt'}</button>`).join(' ')||'Not uploaded'}</div>
        </div></article>`).join("");
    } catch (e) { bikeList.textContent = e.message; }
  }
  for(const [id,delta] of [["bikePrev",-1],["bikeNext",1]])document.getElementById(id)?.addEventListener("click",()=>{bikePage+=delta;hideDetailsPanel();loadBikes();});
  document.getElementById('bikeInventoryTab').addEventListener('click',async e=>{const btn=e.target.closest('[data-evidence-file]');if(!btn)return;e.stopPropagation();try{const response=await api(`/api/admin/bikes/${encodeURIComponent(btn.dataset.evidenceBike)}/evidence/${encodeURIComponent(btn.dataset.evidenceFile)}`);if(!response.ok)throw new Error('Could not open document');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=btn.dataset.evidenceFile;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(err){alert(err.message);}});
  bikeList.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-view-bike]");
    const row = e.target.closest("[data-bike-id]");
    const id = btn?.dataset.viewBike || row?.dataset.bikeId;
    if (id) openBikeDetails(id);
  });
  document.getElementById("closeDetailsBtn").addEventListener("click", hideDetailsPanel);
  editBikeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("editBikeId").value;
    if (!id) return;
    detailMsg.textContent = "Saving…"; updateBikeBtn.disabled = true;
    try {
      const fd = new FormData();
      for(const key of saleKeys){const field=document.getElementById("sale"+key[0].toUpperCase()+key.slice(1));if(!field.disabled)fd.set(key,field.value);}
      for (const [field, id2] of [["brand","editBrand"],["model","editModel"],["year","editYear"],["registrationNumber","editRegistrationNumber"],["kilometersDriven","editKilometersDriven"],["ownershipCount","editOwnershipCount"],["fuelType","editFuelType"],["status","editStatus"],["conditionNotes","editConditionNotes"]]) fd.set(field, document.getElementById(id2).value.trim());
      for(const key of ["engineNumber", "chassisNumber", "registrationDate", "inspectionNotes", "registrationYear", "hpStatus", "nocStatus", "rcAvailable", "keysCount", "insuranceStatus", "engineNoise", "smoke", "selfStart", "clutchPlate", "timingChainNoise", "engineCondition", "batteryWorking", "chassis", "bodyLine", "vehicleRating"])fd.set(key,document.getElementById("edit"+key[0].toUpperCase()+key.slice(1)).value);
      for (const file of document.getElementById("editBikePhotos").files) fd.append("bikePhotos", file);
      for(const kind of ["deliveryPhoto","saleReceipt"]){const file=document.getElementById(kind).files[0];if(file)fd.append(kind,file);}
      const rc = document.getElementById("editRcDocument").files[0]; if (rc) fd.append("rcDocument", rc);
      const res = await api(`/api/admin/bikes/${encodeURIComponent(id)}`, {method:"PUT", body:fd});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not update bike");
      detailMsg.textContent = `Bike #${id} updated successfully.`;
      await openBikeDetails(id); await loadBikes();
    } catch (e) { detailMsg.textContent = e.message; }
    finally { updateBikeBtn.disabled = false; }
  });
  bikeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    bikeMsg.textContent = "Saving…";
    saveBikeBtn.disabled = true;
    try {
      const res = await api("/api/admin/bikes", {method:"POST",body:new FormData(bikeForm)});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save bike");
      bikeForm.reset();
      bikeMsg.textContent = `Bike #${data.bike.id} saved as draft.`;
      bikePage=1;await loadBikes();
      window.dispatchEvent?.(new Event("bk-bikes-changed"));
    } catch (e) { bikeMsg.textContent = e.message; }
    finally { saveBikeBtn.disabled = false; }
  });
  let winnerPage=1;
  const winnerList=document.getElementById('winnerList'),winnerMsg=document.getElementById('winnerMsg');
  async function winnerJson(res){const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Winner request failed');return data;}
  async function loadWinners(){if(!winnerList)return;try{const data=await winnerJson(await api('/api/admin/winners?page='+winnerPage));winnerList.innerHTML=data.rows.map(w=>`<article class="winner-card"><h3>Lot #${esc(w.id)} · ${esc(w.brand)} ${esc(w.model)}</h3><div class="winner-contact">Registration: ${esc(w.registration_number||'Not recorded')} · Bike #${esc(w.bike_id)}<br><strong>Winning bid: ${esc(new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(w.highest_bid)))}</strong><br>Dealer: ${esc(w.full_name)} · ${esc(w.business_name||'Business not recorded')}<br>Email: ${esc(w.email||'Not recorded')}<br>Mobile: ${esc(w.phone||'Not recorded')}<br>Auction closed: ${esc(new Date(w.closed_at).toLocaleString('en-IN'))}</div><label for="winner-instructions-${esc(w.id)}">Payment instructions</label><textarea id="winner-instructions-${esc(w.id)}" maxlength="1000">${esc(data.defaultInstructions)}</textarea><div class="winner-actions"><button type="button" data-notify-winner="${esc(w.id)}" data-channel="email" ${w.email?'':'disabled'}>Prepare Email</button><button type="button" data-notify-winner="${esc(w.id)}" data-channel="whatsapp" ${w.whatsappAvailable?'':'disabled'}>Prepare WhatsApp</button></div>${!w.whatsappAvailable?'<p>WhatsApp needs a saved dealer mobile number.</p>':''}<div id="winner-draft-${esc(w.id)}"></div><details class="winner-history"><summary>Notification records (${w.contacts.length})</summary>${w.contacts.map(c=>`<p>${esc(c.channel)} · ${esc(c.recipient)} · ${esc(new Date(c.created_at).toLocaleString('en-IN'))}<br>${c.marked_sent_at?'Admin marked sent: '+esc(new Date(c.marked_sent_at).toLocaleString('en-IN')):`Draft prepared — delivery not confirmed. <button type="button" data-mark-notice="${esc(c.id)}">Record as sent</button>`}</p>`).join('')||'<p>No notifications prepared.</p>'}</details></article>`).join('')||'<p>No winning auctions yet.</p>';document.getElementById('winnerPrev').disabled=winnerPage===1;document.getElementById('winnerNext').disabled=winnerPage*20>=Number(data.total);document.getElementById('winnerPage').textContent=`Page ${winnerPage} of ${Math.max(1,Math.ceil(Number(data.total)/20))}`;}catch(e){winnerMsg.textContent=e.message;}}
  document.getElementById('refreshWinners')?.addEventListener('click',loadWinners);
  for(const [id,delta] of [['winnerPrev',-1],['winnerNext',1]])document.getElementById(id)?.addEventListener('click',()=>{winnerPage+=delta;loadWinners();});
  winnerList?.addEventListener('click',async e=>{const button=e.target.closest('[data-notify-winner]'),mark=e.target.closest('[data-mark-notice]');if(!button&&!mark)return;const control=button||mark;control.disabled=true;winnerMsg.textContent='';try{if(mark){await winnerJson(await api('/api/admin/winners/contacts/'+mark.dataset.markNotice+'/mark-sent',{method:'POST'}));winnerMsg.textContent='Recorded as sent by admin. This is your confirmation, not a delivery receipt.';await loadWinners();return;}const id=button.dataset.notifyWinner,data=await winnerJson(await api('/api/admin/winners/'+id+'/draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel:button.dataset.channel,instructions:document.getElementById('winner-instructions-'+id).value})}));document.getElementById('winner-draft-'+id).innerHTML=`<pre class="winner-draft">${esc(data.text)}</pre><p>Review the message, open your ${data.channel==='whatsapp'?'WhatsApp account 9900935354':'email app'}, then send it yourself.</p><a class="admin-secondary" href="${esc(data.url)}" target="_blank" rel="noopener noreferrer">Open ${data.channel==='whatsapp'?'WhatsApp':'Email'} →</a><p><button type="button" data-mark-notice="${esc(data.contactId)}">I sent this — record as sent</button></p>`;}catch(err){winnerMsg.textContent=err.message;}finally{control.disabled=false;}});
  let bulkId=null,bulkPending=false;
  const bulkForm=document.getElementById('bulkForm'),bulkMsg=document.getElementById('bulkMsg'),bulkConfirm=document.getElementById('bulkConfirm');
  async function bulkJson(res){const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||'Import request failed');return data;}
  document.getElementById('bulkTemplate')?.addEventListener('click',async()=>{try{const res=await api('/api/admin/bike-import/template');if(!res.ok)await bulkJson(res);const url=URL.createObjectURL(await res.blob()),a=document.createElement('a');a.href=url;a.download='BikesKart_Bulk_Bikes.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){bulkMsg.textContent=e.message;}});
  bulkForm?.addEventListener('change',()=>{bulkId=null;bulkConfirm.hidden=true;document.getElementById('bulkPreview').innerHTML='';bulkMsg.textContent='Files changed. Preview again before importing.';});
  bulkForm?.addEventListener('submit',async e=>{e.preventDefault();if(bulkPending)return;const uploadData=new FormData(bulkForm);bulkPending=true;bulkForm.querySelectorAll('input').forEach(el=>el.disabled=true);bulkId=null;bulkConfirm.hidden=true;const button=document.getElementById('bulkPreviewBtn');button.disabled=true;bulkMsg.textContent='Checking bikes and photos…';try{const data=await bulkJson(await api('/api/admin/bike-import/preview',{method:'POST',body:uploadData}));bulkId=data.previewId;bulkMsg.textContent=data.canImport?`${data.rows.length} bikes ready. Review all details below, then import.`:'Fix the errors in your file and preview again.\n'+data.errors.join('\n');document.getElementById('bulkPreview').innerHTML='<div class="bulk-table-wrap"><table class="bulk-table"><thead><tr><th>Row</th><th>Bike</th><th>Photos</th><th>Details</th><th>Validation</th></tr></thead><tbody>'+data.rows.map(r=>`<tr class="${r.errors.length?'bulk-row-error':''}"><td>${esc(r.row)}</td><td><strong>${esc(r.brand)} ${esc(r.model)}</strong><br>${esc(r.registrationNumber)} · ${esc(r.year)}</td><td>${esc(r.photoCount)}</td><td class="bulk-details"><details><summary>Review fields</summary>${Object.entries(r.details).filter(([k])=>k!=='detailProfile').map(([k,v])=>`<p><b>${esc(k)}</b>: ${esc(v==null||v===''?'Not recorded':v)}</p>`).join('')}</details></td><td>${r.errors.length?r.errors.map(esc).join('<br>'):'Ready'}</td></tr>`).join('')+'</tbody></table></div>';bulkConfirm.hidden=!data.canImport;}catch(e){bulkMsg.textContent=e.message;}finally{bulkPending=false;button.disabled=false;bulkForm.querySelectorAll('input').forEach(el=>el.disabled=false);}});
  bulkConfirm?.addEventListener('click',async()=>{if(!bulkId||bulkPending)return;bulkPending=true;bulkForm.querySelectorAll('input').forEach(el=>el.disabled=true);bulkConfirm.disabled=true;bulkMsg.textContent='Importing…';try{const data=await bulkJson(await api('/api/admin/bike-import/'+bulkId+'/confirm',{method:'POST'}));bulkMsg.textContent=`${data.imported} bikes imported as drafts. Bike IDs: ${data.bikeIds.join(', ')}. View them in Bike Inventory.`;bulkId=null;bulkConfirm.hidden=true;bulkForm.reset();await loadBikes();window.dispatchEvent?.(new Event('bk-bikes-changed'));}catch(e){bulkMsg.textContent=e.message+' You can retry this import safely.';}finally{bulkPending=false;bulkConfirm.disabled=false;bulkForm.querySelectorAll('input').forEach(el=>el.disabled=false);}});
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault(); loginMsg.textContent = "Signing in…";
    try {
      const user = await login(document.getElementById("email").value.trim(), document.getElementById("password").value);
      if (!(await verifyAdmin())) throw new Error("Admin verification failed");
      loginForm.reset(); showDashboard(user);
    } catch (err) { showLogin(err.message); }
  });
  logoutBtn.addEventListener("click", async () => { await fetch("/api/auth/logout",{method:"POST",credentials:"include"}).catch(()=>{}); showLogin("You have been logged out."); });
  (async () => {
    try {
      if (await refreshSession()) {
        const res = await fetch("/api/auth/me",{headers:{Authorization:`Bearer ${accessToken}`},credentials:"include"});
        const data = await res.json().catch(()=>({}));
        if (res.ok && data.user?.role === "admin" && await verifyAdmin()) { showDashboard(data.user); return; }
      }
    } catch {}
    showLogin("");
  })();
})();
