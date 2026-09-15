let accessToken = null;

const $ = (id) => document.getElementById(id);

async function api(url, options = {}) {
  options.headers = options.headers || {};
  if (accessToken) options.headers.Authorization = `Bearer ${accessToken}`;

  let res = await fetch(url, options);

  if (res.status === 401) {
    try {
      const refresh = await fetch("/api/auth/refresh", { method: "POST" });
      if (refresh.ok) {
        const data = await refresh.json();
        accessToken = data.accessToken;
        options.headers.Authorization = `Bearer ${accessToken}`;
        res = await fetch(url, options);
      }
    } catch (_) {}
  }

  return res;
}

function showMessage(message, ok = false) {
  const el = $("bikeMsg") || $("detailMsg");
  if (!el) return;
  el.textContent = message;
  el.className = ok ? "msg success" : "msg error";
}

async function loadBikes() {
  const list = $("recentBikes");
  if (!list) return;

  list.innerHTML = "<p>Loading bikes...</p>";

  try {
    const res = await api("/api/admin/bikes?page=1&pageSize=20");
    const data = await res.json();

    if (!res.ok) {
      list.innerHTML = `<p>${data.message || "Could not load bikes."}</p>`;
      return;
    }

    const bikes = data.bikes || data.items || [];

    if (!bikes.length) {
      list.innerHTML = "<p>No bikes added yet.</p>";
      return;
    }

    list.innerHTML = bikes.map((bike) => `
      <div class="bike-row" data-bike-id="${bike.id}">
        <div class="bike-row-main">
          <strong>${escapeHtml(bike.brand || "")} ${escapeHtml(bike.model || "")}</strong>
          <span>${escapeHtml(String(bike.year || ""))} · ${escapeHtml(bike.status || "draft")}</span>
        </div>
        <button type="button" class="btn btn-small" data-view-bike="${bike.id}">VIEW / EDIT</button>
      </div>
    `).join("");
  } catch (err) {
    list.innerHTML = "<p>Could not connect to the server.</p>";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function openBikeDetails(id) {
  const panel = $("bikeDetailsPanel");
  if (!panel) return;

  panel.hidden = false;
  panel.scrollIntoView({ behavior: "smooth", block: "start" });

  const msg = $("detailMsg");
  if (msg) msg.textContent = "Loading bike details...";

  try {
    const res = await api(`/api/admin/bikes/${encodeURIComponent(id)}`);
    const data = await res.json();

    if (!res.ok) {
      if (msg) msg.textContent = data.message || "Could not load bike.";
      return;
    }

    const bike = data.bike || data;

    const fields = {
      editBrand: bike.brand,
      editModel: bike.model,
      editYear: bike.year,
      editRegistrationNumber: bike.registration_number,
      editKilometersDriven: bike.kilometers_driven,
      editOwnershipCount: bike.ownership_count,
      editFuelType: bike.fuel_type,
      editStatus: bike.status || "draft",
      editConditionNotes: bike.condition_notes
    };

    Object.entries(fields).forEach(([id, value]) => {
      const el = $(id);
      if (el) el.value = value == null ? "" : value;
    });

    const existingPhotos = $("existingPhotos");
    if (existingPhotos) {
      const photos = bike.images || bike.photos || [];
      existingPhotos.innerHTML = photos.length
        ? photos.map((photo) => `
            <img src="${escapeHtml(photo.image_url || photo.url || photo)}"
                 alt="Bike photo"
                 style="width:110px;height:80px;object-fit:cover;border-radius:10px;">
          `).join("")
        : "<p>No photos uploaded.</p>";
    }

    const rcCurrent = $("rcCurrent");
    if (rcCurrent) {
      rcCurrent.innerHTML = bike.rc_document_url
        ? `<a href="${escapeHtml(bike.rc_document_url)}" target="_blank" rel="noopener">View current RC document</a>`
        : "No RC document uploaded.";
    }

    if (msg) msg.textContent = `Bike ${bike.id} loaded.`;
    panel.dataset.bikeId = bike.id;
  } catch (_) {
    if (msg) msg.textContent = "Could not load bike details.";
  }
}

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view-bike]");
  if (viewButton) {
    event.preventDefault();
    openBikeDetails(viewButton.dataset.viewBike);
    return;
  }

  const row = event.target.closest(".bike-row[data-bike-id]");
  if (row && !event.target.closest("button")) {
    openBikeDetails(row.dataset.bikeId);
  }

  if (event.target.closest("[data-close-bike-details]")) {
    const panel = $("bikeDetailsPanel");
    if (panel) panel.hidden = true;
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  const loginForm = $("adminLoginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const email = $("adminEmail")?.value.trim();
      const password = $("adminPassword")?.value;

      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (!res.ok) {
          showMessage(data.message || "Login failed.");
          return;
        }

        if (data.user?.role !== "admin") {
          showMessage("Admin access required.");
          return;
        }

        accessToken = data.accessToken;
        loginForm.hidden = true;

        const dashboard = $("adminDashboard");
        if (dashboard) dashboard.hidden = false;

        await loadBikes();
      } catch (_) {
        showMessage("Could not connect to the server.");
      }
    });
  }

  const addBikeForm = $("addBikeForm");
  if (addBikeForm) {
    addBikeForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const formData = new FormData(addBikeForm);

      try {
        const res = await api("/api/admin/bikes", {
          method: "POST",
          body: formData
        });

        const data = await res.json();

        if (!res.ok) {
          showMessage(data.message || "Could not save bike.");
          return;
        }

        showMessage(`Bike ${data.bike?.id || ""} saved as draft.`, true);
        addBikeForm.reset();
        await loadBikes();
      } catch (_) {
        showMessage("Could not connect to the server.");
      }
    });
  }

  const editBikeForm = $("editBikeForm");
  if (editBikeForm) {
    editBikeForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const panel = $("bikeDetailsPanel");
      const id = panel?.dataset.bikeId;
      if (!id) return;

      const formData = new FormData(editBikeForm);

      try {
        const res = await api(`/api/admin/bikes/${encodeURIComponent(id)}`, {
          method: "PUT",
          body: formData
        });

        const data = await res.json();

        if (!res.ok) {
          if ($("detailMsg")) $("detailMsg").textContent = data.message || "Could not update bike.";
          return;
        }

        if ($("detailMsg")) $("detailMsg").textContent = `Bike ${id} updated successfully.`;
        await loadBikes();
        await openBikeDetails(id);
      } catch (_) {
        if ($("detailMsg")) $("detailMsg").textContent = "Could not connect to the server.";
      }
    });
  }

  const refreshBtn = $("refreshBikesBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", loadBikes);

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch (_) {}
      accessToken = null;
      location.reload();
    });
  }

  // If this page is already authenticated by the refresh cookie,
  // restore the admin session automatically.
  try {
    const refresh = await fetch("/api/auth/refresh", { method: "POST" });
    if (refresh.ok) {
      const data = await refresh.json();
      accessToken = data.accessToken;

      const ping = await api("/api/admin/ping");
      if (ping.ok) {
        if (loginForm) loginForm.hidden = true;
        const dashboard = $("adminDashboard");
        if (dashboard) dashboard.hidden = false;
        await loadBikes();
      }
    }
  } catch (_) {}
});
