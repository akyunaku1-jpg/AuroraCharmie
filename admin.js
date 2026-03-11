const PRODUCTS_TABLE = "products";

let pendingDeleteId = null;

async function getSupabaseClient(maxAttempts = 30, delayMs = 100) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (window.supabaseClient) {
      return window.supabaseClient;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  const reason = window.supabaseInitError?.message || "Supabase client is not initialized.";
  throw new Error(reason);
}

function showBox(element, message) {
  if (!element) return;
  element.textContent = message || "";
  if (message) {
    element.classList.add("show");
  } else {
    element.classList.remove("show");
  }
}

function clearAuthMessages() {
  showBox(document.getElementById("errorBox"), "");
  showBox(document.getElementById("successBox"), "");
}

function getProductDescription(product) {
  return product?.desc ?? "";
}

function getProductImagePath(product) {
  const raw = String(product?.image ?? "").trim();
  if (!raw) return "";
  const bucket = String(window.supabaseStorageBucket || "product-images").trim() || "product-images";
  const projectUrl = String(window.supabaseProjectUrl || "").trim();

  if (projectUrl && !/^https?:\/\//i.test(raw)) {
    const objectPath = raw
      .replace(/^\/?storage\/v1\/object\/public\/[^/]+\//i, "")
      .replace(/^\/?public\/product-images\//i, "")
      .replace(/^\.?\//, "");
    if (objectPath) {
      return `${projectUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`;
    }
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      if (projectUrl && parsed.pathname) {
        const objectPath = parsed.pathname
          .replace(/^\/?public\/product-images\//i, "")
          .replace(/^\/?storage\/v1\/object\/public\/[^/]+\//i, "")
          .replace(/^\.?\//, "");
        if (objectPath) {
          return `${projectUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${objectPath
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/")}`;
        }
      }
      return parsed.pathname;
    }
    return parsed.href;
  } catch (error) {
    return raw.startsWith("/") ? raw : `/${raw.replace(/^\.?\//, "")}`;
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      toast.remove();
    }, 260);
  }, 3000);
}

function buildStorageObjectPath(fileName) {
  const safeName = String(fileName || "image")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const datePrefix = new Date().toISOString().slice(0, 10);
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `${datePrefix}/${Date.now()}-${randomSuffix}-${safeName || "image"}`;
}

async function uploadProductImage(file) {
  if (!file) return "";
  const supabase = await getSupabaseClient();
  const bucket = String(window.supabaseStorageBucket || "product-images").trim() || "product-images";
  const objectPath = buildStorageObjectPath(file.name);

  const { error: uploadError } = await supabase.storage.from(bucket).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream"
  });
  if (uploadError) {
    throw new Error(uploadError.message || "Gagal upload gambar ke storage.");
  }

  const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
  const publicUrl = data?.publicUrl || "";
  if (!publicUrl) {
    throw new Error("Public URL gambar tidak ditemukan.");
  }
  return publicUrl;
}

async function initLoginPage() {
  clearAuthMessages();
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginBtn = document.getElementById("loginBtn");
  const errorBox = document.getElementById("errorBox");
  if (!emailInput || !passwordInput || !loginBtn || !errorBox) return;

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data?.session) {
      window.location.replace("/admin-dashboard");
      return;
    }
  } catch (error) {
    showBox(errorBox, error.message || "Failed to initialize login.");
  }

  loginBtn.addEventListener("click", async () => {
    clearAuthMessages();
    loginBtn.disabled = true;

    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      if (!email || !password) {
        throw new Error("Email dan password wajib diisi.");
      }

      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.replace("/admin-dashboard");
    } catch (error) {
      showBox(errorBox, error.message || "Login gagal.");
    } finally {
      loginBtn.disabled = false;
    }
  });
}

async function initRegisterPage() {
  clearAuthMessages();
  const emailInput = document.getElementById("regEmailInput");
  const passwordInput = document.getElementById("regPasswordInput");
  const confirmInput = document.getElementById("regConfirmPasswordInput");
  const registerBtn = document.getElementById("registerBtn");
  const errorBox = document.getElementById("errorBox");
  const successBox = document.getElementById("successBox");
  if (!emailInput || !passwordInput || !confirmInput || !registerBtn || !errorBox || !successBox) return;

  registerBtn.addEventListener("click", async () => {
    clearAuthMessages();
    registerBtn.disabled = true;

    try {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmInput.value;
      if (!email || !password || !confirmPassword) {
        throw new Error("Semua field wajib diisi.");
      }
      if (password !== confirmPassword) {
        throw new Error("Password dan konfirmasi password tidak sama.");
      }

      const supabase = await getSupabaseClient();
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;

      showBox(successBox, "Pendaftaran berhasil. Mengarahkan ke halaman login...");
      setTimeout(() => {
        window.location.replace("/admin-login");
      }, 2000);
    } catch (error) {
      showBox(errorBox, error.message || "Pendaftaran gagal.");
    } finally {
      registerBtn.disabled = false;
    }
  });
}

async function loadProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.from(PRODUCTS_TABLE).select("*").order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      grid.innerHTML = `<div class="product-item"><p>Belum ada produk</p></div>`;
      return;
    }

    grid.innerHTML = data
      .map((product) => {
        const imagePath = getProductImagePath(product);
        const description = getProductDescription(product);
        const productId = product.id || "";
        const productName = product.name || "";
        return `
          <article class="product-item">
            <img src="${escapeHtml(imagePath)}" alt="${escapeHtml(product.name || "Product")}" />
            <h4>${escapeHtml(product.name || "-")}</h4>
            <p><strong>${escapeHtml(product.price || "-")}</strong></p>
            <p>${escapeHtml(description || "-")}</p>
            <div class="product-actions">
              <button class="edit-btn" type="button" data-action="edit" data-id="${escapeHtml(productId)}" data-name="${escapeHtml(productName)}">Edit</button>
              <button class="delete-btn" type="button" data-action="delete" data-id="${escapeHtml(productId)}" data-name="${escapeHtml(productName)}">Hapus</button>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const product = data.find((item) => {
          const itemId = String(item.id || "");
          const itemName = String(item.name || "");
          const btnId = String(btn.dataset.id || "");
          const btnName = String(btn.dataset.name || "");
          return (btnId && itemId === btnId) || itemName === btnName;
        });
        if (product) openEditModal(product);
      });
    });

    grid.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const product = data.find((item) => {
          const itemId = String(item.id || "");
          const itemName = String(item.name || "");
          const btnId = String(btn.dataset.id || "");
          const btnName = String(btn.dataset.name || "");
          return (btnId && itemId === btnId) || itemName === btnName;
        });
        if (product) openDeleteModal(product.id || "", product.name || "-");
      });
    });
  } catch (error) {
    showToast(error.message || "Failed to load products.", "error");
  }
}

async function handleAddProduct() {
  const nameInput = document.getElementById("prodName");
  const priceInput = document.getElementById("prodPrice");
  const descInput = document.getElementById("prodDesc");
  const imageInput = document.getElementById("prodImage");
  const errorBox = document.getElementById("addErrorBox");
  const successBox = document.getElementById("addSuccessBox");
  const addBtn = document.getElementById("addProductBtn");
  if (!nameInput || !priceInput || !descInput || !imageInput || !errorBox || !successBox || !addBtn) return;

  showBox(errorBox, "");
  showBox(successBox, "");
  addBtn.disabled = true;

  try {
    const name = nameInput.value.trim();
    const price = priceInput.value.trim();
    const desc = descInput.value.trim();
    if (!name || !price || !desc) {
      throw new Error("Nama, harga, dan deskripsi wajib diisi.");
    }

    let image = "";
    const file = imageInput.files?.[0];
    if (file) {
      image = await uploadProductImage(file);
    }

    const supabase = await getSupabaseClient();
    const productObject = {
      name,
      price,
      desc,
      category: "Misc",
      is_new: false,
      image
    };

    const { error } = await supabase.from(PRODUCTS_TABLE).insert([productObject]);
    if (error) throw error;

    nameInput.value = "";
    priceInput.value = "";
    descInput.value = "";
    imageInput.value = "";
    showBox(successBox, "Produk berhasil ditambahkan.");
    showToast("Produk berhasil ditambahkan.", "success");
    await loadProducts();
  } catch (error) {
    showBox(errorBox, error.message || "Gagal menambah produk.");
    showToast(error.message || "Gagal menambah produk.", "error");
  } finally {
    addBtn.disabled = false;
  }
}

function openEditModal(product) {
  const modal = document.getElementById("editModal");
  if (!modal) return;

  document.getElementById("editProductId").value = product.id || "";
  document.getElementById("editExistingImage").value = getProductImagePath(product);
  document.getElementById("editName").value = product.name || "";
  document.getElementById("editPrice").value = product.price || "";
  document.getElementById("editDesc").value = getProductDescription(product);
  document.getElementById("editImage").value = "";
  modal.dataset.lookupName = product.name || "";
  showBox(document.getElementById("editErrorBox"), "");
  modal.classList.add("active");
}

async function handleSaveEdit() {
  const productId = document.getElementById("editProductId")?.value || "";
  const editModal = document.getElementById("editModal");
  const lookupName = editModal?.dataset.lookupName || "";
  const existingImage = document.getElementById("editExistingImage")?.value || "";
  const name = document.getElementById("editName")?.value.trim() || "";
  const price = document.getElementById("editPrice")?.value.trim() || "";
  const desc = document.getElementById("editDesc")?.value.trim() || "";
  const imageInput = document.getElementById("editImage");
  const errorBox = document.getElementById("editErrorBox");
  const saveBtn = document.getElementById("saveEditBtn");
  if ((!productId && !lookupName) || !imageInput || !errorBox || !saveBtn) return;

  showBox(errorBox, "");
  saveBtn.disabled = true;

  try {
    if (!name || !price || !desc) {
      throw new Error("Nama, harga, dan deskripsi wajib diisi.");
    }

    let image = existingImage;
    const file = imageInput.files?.[0];
    if (file) {
      image = await uploadProductImage(file);
    }

    const supabase = await getSupabaseClient();
    const productObject = {
      name,
      price,
      desc,
      image
    };

    let query = supabase.from(PRODUCTS_TABLE).update(productObject);
    query = productId ? query.eq("id", productId) : query.eq("name", lookupName);
    const { error } = await query;
    if (error) throw error;

    closeModal("editModal");
    showToast("Produk berhasil diperbarui.", "success");
    await loadProducts();
  } catch (error) {
    showBox(errorBox, error.message || "Gagal menyimpan perubahan.");
  } finally {
    saveBtn.disabled = false;
  }
}

function openDeleteModal(id, name) {
  pendingDeleteId = id || "";
  const deleteName = document.getElementById("deleteProductName");
  const modal = document.getElementById("deleteModal");
  if (deleteName) deleteName.textContent = name || "-";
  if (modal) {
    modal.dataset.lookupName = name || "";
    modal.classList.add("active");
  }
}

async function handleConfirmDelete() {
  const deleteModal = document.getElementById("deleteModal");
  const lookupName = deleteModal?.dataset.lookupName || "";
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  if ((!pendingDeleteId && !lookupName) || !confirmBtn) return;

  confirmBtn.disabled = true;
  try {
    const supabase = await getSupabaseClient();
    let query = supabase.from(PRODUCTS_TABLE).delete();
    query = pendingDeleteId ? query.eq("id", pendingDeleteId) : query.eq("name", lookupName);
    const { error } = await query;
    if (error) throw error;

    closeModal("deleteModal");
    showToast("Produk berhasil dihapus.", "success");
    await loadProducts();
  } catch (error) {
    showToast(error.message || "Gagal menghapus produk.", "error");
  } finally {
    pendingDeleteId = null;
    confirmBtn.disabled = false;
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("active");
  if (modalId === "editModal" || modalId === "deleteModal") {
    modal.dataset.lookupName = "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function initDashboardPage() {
  const logoutBtn = document.getElementById("logoutBtn");
  const addProductBtn = document.getElementById("addProductBtn");
  const saveEditBtn = document.getElementById("saveEditBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

  try {
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (!data?.session) {
      window.location.replace("/admin-login");
      return;
    }
  } catch (error) {
    showToast(error.message || "Session check failed.", "error");
    window.location.replace("/admin-login");
    return;
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        const supabase = await getSupabaseClient();
        await supabase.auth.signOut();
      } finally {
        window.location.replace("/admin-login");
      }
    });
  }

  if (addProductBtn) addProductBtn.addEventListener("click", handleAddProduct);
  if (saveEditBtn) saveEditBtn.addEventListener("click", handleSaveEdit);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", () => closeModal("editModal"));
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener("click", handleConfirmDelete);
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", () => closeModal("deleteModal"));

  await loadProducts();
}

window.showToast = showToast;
window.initLoginPage = initLoginPage;
window.initRegisterPage = initRegisterPage;
window.initDashboardPage = initDashboardPage;
window.loadProducts = loadProducts;
window.handleAddProduct = handleAddProduct;
window.openEditModal = openEditModal;
window.handleSaveEdit = handleSaveEdit;
window.openDeleteModal = openDeleteModal;
window.handleConfirmDelete = handleConfirmDelete;
