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

  function showDashboard(user) {
    loginPanel.classList.remove("active");
    dashboardPanel.classList.add("active");
    adminUser.textContent = `${user.full_name || user.email} • Administrator`;
    loadBikes();
    window.dispatchEvent?.(new Event("bk-admin-ready"));
  }
  function showLogin(message = "") {
    accessToken = null;
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
      setValue("editBikeId", b.id); setValue("editBrand", b.brand); setValue("editModel", b.model);
      setValue("editYear", b.year); setValue("editRegistrationNumber", b.registration_number);
      setValue("editKilometersDriven", b.kilometers_driven); setValue("editOwnershipCount", b.ownership_count);
      setValue("editFuelType", b.fuel_type); setValue("editStatus", b.status); setValue("editConditionNotes", b.condition_notes);
      document.getElementById("detailsTitle").textContent = `${b.brand} ${b.model}`;
      document.getElementById("detailsSub").textContent = `Bike #${b.id} • ${b.status || "draft"}`;
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
  async function loadBikes() {
    bikeList.textContent = "Loading…";
    try {
      const res = await api("/api/admin/bikes?page=1&pageSize=20");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load bikes");
      if (!data.rows?.length) { bikeList.innerHTML = '<div class="empty-state">No bikes added yet.</div>'; return; }
      bikeList.innerHTML = data.rows.map(b => `
        <div class="bike-row" data-bike-id="${esc(b.id)}">
          ${b.cover_image ? `<img class="bike-thumb" src="${esc(b.cover_image)}" alt="">` : `<div class="bike-thumb"></div>`}
          <div class="bike-meta"><b>${esc(b.brand)} ${esc(b.model)}</b><small>${esc(b.year)}${b.registration_number ? ` · ${esc(b.registration_number)}` : ""}</small></div>
          <div class="bike-meta"><small>${b.kilometers_driven != null ? `${esc(b.kilometers_driven)} km` : "KM not added"}</small></div>
          <div><span class="status-pill">${esc(b.status)}</span></div>
          <div><button class="view-btn" type="button" data-view-bike="${esc(b.id)}">VIEW / EDIT</button></div>
        </div>`).join("");
    } catch (e) { bikeList.textContent = e.message; }
  }
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
      for (const [field, id2] of [["brand","editBrand"],["model","editModel"],["year","editYear"],["registrationNumber","editRegistrationNumber"],["kilometersDriven","editKilometersDriven"],["ownershipCount","editOwnershipCount"],["fuelType","editFuelType"],["status","editStatus"],["conditionNotes","editConditionNotes"]]) fd.set(field, document.getElementById(id2).value.trim());
      for (const file of document.getElementById("editBikePhotos").files) fd.append("bikePhotos", file);
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
      await loadBikes();
    } catch (e) { bikeMsg.textContent = e.message; }
    finally { saveBikeBtn.disabled = false; }
  });
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
