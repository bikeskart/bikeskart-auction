(() => {
  let accessToken = null;

  const loginPanel = document.getElementById("loginPanel");
  const dashboardPanel = document.getElementById("dashboardPanel");
  const loginForm = document.getElementById("loginForm");
  const loginMsg = document.getElementById("loginMsg");
  const adminUser = document.getElementById("adminUser");
  const logoutBtn = document.getElementById("logoutBtn");

  function showDashboard(user) {
    loginPanel.classList.remove("active");
    dashboardPanel.classList.add("active");
    adminUser.textContent = `${user.full_name || user.email} • Administrator`;
  }

  function showLogin(message = "") {
    accessToken = null;
    dashboardPanel.classList.remove("active");
    loginPanel.classList.add("active");
    loginMsg.textContent = message;
  }

  async function login(email, password) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      credentials: "include",
      body: JSON.stringify({email, password})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Login failed");
    if (!data.user || data.user.role !== "admin") {
      await fetch("/api/auth/logout", {method: "POST", credentials: "include"});
      throw new Error("This login is not an administrator account");
    }
    accessToken = data.accessToken;
    return data.user;
  }

  async function verifyAdmin() {
    if (!accessToken) return false;
    const res = await fetch("/api/admin/ping", {
      headers: {Authorization: `Bearer ${accessToken}`},
      credentials: "include"
    });
    return res.ok;
  }

  async function refreshSession() {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include"
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    if (!data.accessToken) return false;
    accessToken = data.accessToken;
    return true;
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    loginMsg.textContent = "Signing in…";
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    try {
      const user = await login(email, password);
      if (!(await verifyAdmin())) throw new Error("Admin verification failed");
      loginForm.reset();
      showDashboard(user);
    } catch (err) {
      showLogin(err.message);
    }
  });

  logoutBtn.addEventListener("click", async () => {
    await fetch("/api/auth/logout", {method: "POST", credentials: "include"}).catch(() => {});
    showLogin("You have been logged out.");
  });

  // Restore a valid admin session after a page refresh using the secure refresh cookie.
  (async () => {
    try {
      if (await refreshSession()) {
        const res = await fetch("/api/auth/me", {
          headers: {Authorization: `Bearer ${accessToken}`},
          credentials: "include"
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user?.role === "admin" && await verifyAdmin()) {
          showDashboard(data.user);
          return;
        }
      }
    } catch {}
    showLogin("");
  })();
})();
