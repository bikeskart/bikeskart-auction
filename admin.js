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

  function showDashboard(user) {
    loginPanel.classList.remove("active");
    dashboardPanel.classList.add("active");
    adminUser.textContent = `${user.full_name || user.email} • Administrator`;
    loadBikes();
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
  async function api(url, options={}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${accessToken}`);
    return fetch(url, {...options, headers, credentials:"include"});
  }
  function esc(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
  async function loadBikes() {
    bikeList.textContent = "Loading…";
    try {
      const res = await api("/api/admin/bikes?page=1&pageSize=20");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load bikes");
      if (!data.rows?.length) { bikeList.innerHTML = '<div class="empty-state">No bikes added yet.</div>'; return; }
      bikeList.innerHTML = data.rows.map(b => `
        <div class="bike-row">
          ${b.cover_image ? `<img class="bike-thumb" src="${esc(b.cover_image)}" alt="">` : `<div class="bike-thumb"></div>`}
          <div class="bike-meta"><b>${esc(b.brand)} ${esc(b.model)}</b><small>${esc(b.year)}${b.registration_number ? ` · ${esc(b.registration_number)}` : ""}</small></div>
          <div class="bike-meta"><small>${b.kilometers_driven != null ? `${esc(b.kilometers_driven)} km` : "KM not added"}</small></div>
          <div><span class="status-pill">${esc(b.status)}</span></div>
          <div><small>#${esc(b.id)}</small></div>
        </div>`).join("");
    } catch (e) { bikeList.textContent = e.message; }
  }
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
