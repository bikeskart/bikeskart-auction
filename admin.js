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
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || "Login failed");
    }

    if (!data.user || data.user.role !== "admin") {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });

      throw new Error(
        "This login is not an administrator account"
      );
    }

    accessToken = data.accessToken;

    return data.user;
  }

  async function verifyAdmin() {
    if (!accessToken) return false;

    const res = await fetch("/api/admin/ping", {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
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

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});

    headers.set(
      "Authorization",
      `Bearer ${accessToken}`
    );

    return fetch(url, {
      ...options,
      headers,
      credentials: "include"
    });
  }

  function esc(v) {
    return String(v ?? "").replace(
      /[&<>'"]/g,
      c =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;"
        }[c])
    );
  }

  function setValue(id, value) {
    const el = document.getElementById(id);

    if (el) {
      el.value = value ?? "";
    }
  }

  function showDetailsPanel() {
    bikeDetailsPanel.classList.add("active");

    bikeDetailsPanel.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  function hideDetailsPanel() {
    bikeDetailsPanel.classList.remove("active");
    detailMsg.textContent = "";
    editBikeForm.reset();
  }

  /*
   * Convert the image path returned by the API into a
   * browser-accessible URL.
   *
   * Example:
   * /uploads/bikes/photo.jpg
   *
   * becomes:
   * https://auction.bikeskart.com/uploads/bikes/photo.jpg
   */
  function getPhotoUrl(image) {
    if (!image) return "";

    let url = "";

    if (typeof image === "string") {
      url = image;
    } else {
      url =
        image.image_url ||
        image.url ||
        image.path ||
        image.file_url ||
        image.image ||
        "";
    }

    url = String(url || "").trim();

    if (!url) return "";

    if (
      url.startsWith("http://") ||
      url.startsWith("https://")
    ) {
      return url;
    }

    if (!url.startsWith("/")) {
      url = "/" + url;
    }

    return window.location.origin + url;
  }

  /*
   * Display existing bike photos.
   */
  function displayExistingPhotos(bike) {
    const photosContainer =
      document.getElementById("existingPhotos");

    if (!photosContainer) return;

    const images = Array.isArray(bike.images)
      ? bike.images
      : Array.isArray(bike.photos)
        ? bike.photos
        : [];

    if (!images.length) {
      photosContainer.innerHTML = `
        <div class="details-note">
          No bike photos uploaded.
        </div>
      `;

      return;
    }

    photosContainer.innerHTML = `
      <div
        style="
          display:grid;
          grid-template-columns:repeat(auto-fill,minmax(130px,1fr));
          gap:12px;
          width:100%;
        "
      >
        ${images
          .map((image, index) => {
            const photoUrl = getPhotoUrl(image);

            if (!photoUrl) {
              return `
                <div
                  style="
                    min-height:110px;
                    border:1px solid #ddd;
                    border-radius:10px;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    text-align:center;
                    font-size:12px;
                    color:#777;
                    padding:8px;
                  "
                >
                  Photo unavailable
                </div>
              `;
            }

            return `
              <div
                style="
                  border:1px solid #ddd;
                  border-radius:10px;
                  padding:5px;
                  background:#fff;
                "
              >

                <a
                  href="${esc(photoUrl)}"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open photo ${index + 1}"
                >

                  <img
                    src="${esc(photoUrl)}"
                    alt="Bike photo ${index + 1}"
                    loading="lazy"
                    style="
                      width:100%;
                      height:100px;
                      object-fit:cover;
                      border-radius:7px;
                      display:block;
                      cursor:pointer;
                    "
                    onerror="this.style.display='none'; this.parentElement.nextElementSibling.style.display='flex';"
                  >

                </a>

                <div
                  style="
                    display:none;
                    height:100px;
                    align-items:center;
                    justify-content:center;
                    text-align:center;
                    font-size:12px;
                    color:#777;
                  "
                >
                  Unable to load photo
                </div>

                <div
                  style="
                    text-align:center;
                    font-size:11px;
                    color:#666;
                    padding:5px 2px 2px;
                  "
                >
                  Photo ${index + 1}
                </div>

              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  async function openBikeDetails(id) {
    detailMsg.textContent = "Loading…";

    showDetailsPanel();

    try {
      const res = await api(
        `/api/admin/bikes/${encodeURIComponent(id)}`
      );

      const data =
        await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.error || "Could not load bike"
        );
      }

      const b = data.bike;

      setValue("editBikeId", b.id);
      setValue("editBrand", b.brand);
      setValue("editModel", b.model);
      setValue("editYear", b.year);
      setValue(
        "editRegistrationNumber",
        b.registration_number
      );
      setValue(
        "editKilometersDriven",
        b.kilometers_driven
      );
      setValue(
        "editOwnershipCount",
        b.ownership_count
      );
      setValue("editFuelType", b.fuel_type);
      setValue("editStatus", b.status);
      setValue(
        "editConditionNotes",
        b.condition_notes
      );

      document.getElementById(
        "detailsTitle"
      ).textContent =
        `${b.brand} ${b.model}`;

      document.getElementById(
        "detailsSub"
      ).textContent =
        `Bike #${b.id} • ${b.status || "draft"}`;

      /*
       * PHOTO DISPLAY
       */
      displayExistingPhotos(b);

      /*
       * RC DOCUMENT
       */
      const rc =
        document.getElementById("rcCurrent");

      if (rc) {
        rc.innerHTML = b.rc_document_url
          ? `
            <a
              href="${esc(
                getPhotoUrl(b.rc_document_url)
              )}"
              target="_blank"
              rel="noopener"
            >
              Current RC document
            </a>
          `
          : "No RC document uploaded.";
      }

      detailMsg.textContent = "";

      /*
       * Useful debugging information.
       * Open browser console if a photo doesn't load.
       */
      console.log("Bike details:", b);
      console.log("Bike images:", b.images);

    } catch (e) {
      detailMsg.textContent = e.message;
      console.error("Bike details error:", e);
    }
  }

  async function loadBikes() {
    bikeList.textContent = "Loading…";

    try {
      const res = await api(
        "/api/admin/bikes?page=1&pageSize=20"
      );

      const data =
        await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(
          data.error || "Could not load bikes"
        );
      }

      if (!data.rows?.length) {
        bikeList.innerHTML =
          '<div class="empty-state">No bikes added yet.</div>';

        return;
      }

      bikeList.innerHTML =
        data.rows
          .map(
            b => `
              <div
                class="bike-row"
                data-bike-id="${esc(b.id)}"
              >

                ${
                  b.cover_image
                    ? `
                      <img
                        class="bike-thumb"
                        src="${esc(
                          getPhotoUrl(b.cover_image)
                        )}"
                        alt=""
                      >
                    `
                    : `
                      <div class="bike-thumb"></div>
                    `
                }

                <div class="bike-meta">
                  <b>
                    ${esc(b.brand)}
                    ${esc(b.model)}
                  </b>

                  <small>
                    ${esc(b.year)}
                    ${
                      b.registration_number
                        ? ` · ${esc(
                            b.registration_number
                          )}`
                        : ""
                    }
                  </small>
                </div>

                <div class="bike-meta">
                  <small>
                    ${
                      b.kilometers_driven != null
                        ? `${esc(
                            b.kilometers_driven
                          )} km`
                        : "KM not added"
                    }
                  </small>
                </div>

                <div>
                  <span class="status-pill">
                    ${esc(b.status)}
                  </span>
                </div>

                <div>
                  <button
                    class="view-btn"
                    type="button"
                    data-view-bike="${esc(b.id)}"
                  >
                    VIEW / EDIT
                  </button>
                </div>

              </div>
            `
          )
          .join("");

    } catch (e) {
      bikeList.textContent = e.message;
    }
  }

  bikeList.addEventListener("click", e => {
    const btn =
      e.target.closest("[data-view-bike]");

    const row =
      e.target.closest("[data-bike-id]");

    const id =
      btn?.dataset.viewBike ||
      row?.dataset.bikeId;

    if (id) {
      openBikeDetails(id);
    }
  });

  document
    .getElementById("closeDetailsBtn")
    .addEventListener(
      "click",
      hideDetailsPanel
    );

  /*
   * EDIT BIKE
   */
  editBikeForm.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      const id =
        document.getElementById(
          "editBikeId"
        ).value;

      if (!id) return;

      detailMsg.textContent = "Saving…";
      updateBikeBtn.disabled = true;

      try {
        const fd = new FormData();

        for (
          const [
            field,
            id2
          ] of [
            ["brand", "editBrand"],
            ["model", "editModel"],
            ["year", "editYear"],
            [
              "registrationNumber",
              "editRegistrationNumber"
            ],
            [
              "kilometersDriven",
              "editKilometersDriven"
            ],
            [
              "ownershipCount",
              "editOwnershipCount"
            ],
            ["fuelType", "editFuelType"],
            ["status", "editStatus"],
            [
              "conditionNotes",
              "editConditionNotes"
            ]
          ]
        ) {
          fd.set(
            field,
            document
              .getElementById(id2)
              .value
              .trim()
          );
        }

        for (
          const file of document
            .getElementById("editBikePhotos")
            .files
        ) {
          fd.append("bikePhotos", file);
        }

        const rc =
          document.getElementById(
            "editRcDocument"
          ).files[0];

        if (rc) {
          fd.append("rcDocument", rc);
        }

        const res = await api(
          `/api/admin/bikes/${encodeURIComponent(
            id
          )}`,
          {
            method: "PUT",
            body: fd
          }
        );

        const data =
          await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data.error ||
              "Could not update bike"
          );
        }

        detailMsg.textContent =
          `Bike #${id} updated successfully.`;

        await openBikeDetails(id);
        await loadBikes();

      } catch (e) {
        detailMsg.textContent = e.message;

      } finally {
        updateBikeBtn.disabled = false;
      }
    }
  );

  /*
   * ADD BIKE
   */
  bikeForm.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      bikeMsg.textContent = "Saving…";
      saveBikeBtn.disabled = true;

      try {
        const res = await api(
          "/api/admin/bikes",
          {
            method: "POST",
            body: new FormData(bikeForm)
          }
        );

        const data =
          await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(
            data.error ||
              "Could not save bike"
          );
        }

        bikeForm.reset();

        bikeMsg.textContent =
          `Bike #${data.bike.id} saved as draft.`;

        await loadBikes();

      } catch (e) {
        bikeMsg.textContent = e.message;

      } finally {
        saveBikeBtn.disabled = false;
      }
    }
  );

  /*
   * LOGIN
   *
   * This is intentionally kept the same
   * as your working login code.
   */
  loginForm.addEventListener(
    "submit",
    async e => {
      e.preventDefault();

      loginMsg.textContent =
        "Signing in…";

      try {
        const user = await login(
          document
            .getElementById("email")
            .value
            .trim(),

          document
            .getElementById("password")
            .value
        );

        if (!(await verifyAdmin())) {
          throw new Error(
            "Admin verification failed"
          );
        }

        loginForm.reset();

        showDashboard(user);

      } catch (err) {
        showLogin(err.message);
      }
    }
  );

  /*
   * LOGOUT
   */
  logoutBtn.addEventListener(
    "click",
    async () => {
      await fetch(
        "/api/auth/logout",
        {
          method: "POST",
          credentials: "include"
        }
      ).catch(() => {});

      showLogin(
        "You have been logged out."
      );
    }
  );

  /*
   * RESTORE SESSION
   *
   * Keep this exactly for automatic
   * login restoration.
   */
  (async () => {
    try {
      if (await refreshSession()) {

        const res =
          await fetch(
            "/api/auth/me",
            {
              headers: {
                Authorization:
                  `Bearer ${accessToken}`
              },
              credentials: "include"
            }
          );

        const data =
          await res
            .json()
            .catch(() => ({}));

        if (
          res.ok &&
          data.user?.role === "admin" &&
          await verifyAdmin()
        ) {
          showDashboard(
            data.user
          );

          return;
        }
      }

    } catch (_) {}

    showLogin("");
  })();

})();

Important: This version preserves your working authentication structure and changes the photo handling only. The existing-photo section now reads the "image_url" returned by your "bikeModel.js", converts "/uploads/bikes/..." into the current auction-domain URL, and makes each photo clickable.

After uploading it, clear/reload the browser page completely and test login first. Then open VIEW / EDIT.
