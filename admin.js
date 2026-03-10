const PRODUCTS_TABLE = "products";
const LOCAL_PRODUCTS_KEY = "aurora_products";

let supabaseClient = null;
let pendingDeleteId = null;
let runtimeConfig = null;

function readLocalProducts() {
  try {
    const raw = window.localStorage.getItem(LOCAL_PRODUCTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeLocalProducts(products) {
  try {
    window.localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
  } catch (error) {
    // Ignore localStorage quota/access errors.
  }
}

function mergeProductsWithLocalImages(products) {
  const localProducts = readLocalProducts();
  const imageByName = new Map(
    localProducts
      .filter((item) => item && typeof item.name === "string" && String(item.image || "").startsWith("data:"))
      .map((item) => [item.name, item.image])
  );

  return products.map((item) => ({
    ...item,
    image: imageByName.get(item.name) || item.image || ""
  }));
}

function upsertLocalProduct(product, previousName = product.name) {
  const current = readLocalProducts();
  const index = current.findIndex((item) => String(item.name) === String(previousName));
  if (index >= 0) {
    current[index] = product;
  } else {
    current.unshift(product);
  }
  writeLocalProducts(current);
}

function removeLocalProduct(productName) {
  const current = readLocalProducts();
  const next = current.filter((item) => String(item.name) !== String(productName));
  writeLocalProducts(next);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
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

async function getSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library is not loaded.");
  }

  const response = await fetch("/api/config", {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    throw new Error("Failed to load runtime config.");
  }

  const config = await response.json();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error("Supabase credentials are missing.");
  }

  runtimeConfig = config;
  supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabaseClient;
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

async function initLoginPage() {
  clearAuthMessages();
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginBtn = document.getElementById("loginBtn");
  const errorBox = document.getElementById("errorBox");
  if (!emailInput || !passwordInput || !loginBtn || !errorBox) return;

  try {
    const supabase = await getSupabase();
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

      const supabase = await getSupabase();
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

      const supabase = await getSupabase();
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

async function initDashboardPage() {
  const logoutBtn = document.getElementById("logoutBtn");
  const addProductBtn = document.getElementById("addProductBtn");
  const saveEditBtn = document.getElementById("saveEditBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

  try {
    const supabase = await getSupabase();
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
        const supabase = await getSupabase();
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

async function loadProducts() {
  const grid = document.getElementById("productGrid");
  if (!grid) return;

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from(PRODUCTS_TABLE)
      .select("name, price, category, desc, is_new, color, image, created_at")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const mergedData = mergeProductsWithLocalImages(data || []);
    writeLocalProducts(mergedData);

    if (!mergedData || mergedData.length === 0) {
      grid.innerHTML = `<div class="product-item"><p>Belum ada produk</p></div>`;
      return;
    }

    grid.innerHTML = mergedData
      .map((product) => {
        const imagePath = product.image || "";
        return `
          <article class="product-item">
            <img src="${escapeHtml(imagePath)}" alt="${escapeHtml(product.name || "Product")}" />
            <h4>${escapeHtml(product.name || "-")}</h4>
            <p><strong>${escapeHtml(product.price || "-")}</strong></p>
            <p>${escapeHtml(product.desc || "-")}</p>
            <div class="product-actions">
              <button class="edit-btn" type="button" data-action="edit" data-id="${escapeHtml(product.name)}">Edit</button>
              <button class="delete-btn" type="button" data-action="delete" data-id="${escapeHtml(product.name)}">Hapus</button>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const product = mergedData.find((item) => String(item.name) === String(btn.dataset.id));
        if (product) openEditModal(product);
      });
    });

    grid.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const product = mergedData.find((item) => String(item.name) === String(btn.dataset.id));
        if (product) openDeleteModal(product.name, product.name || "-");
      });
    });
  } catch (error) {
    const localData = readLocalProducts();
    if (localData.length > 0) {
      grid.innerHTML = localData
        .map((product) => {
          const imagePath = product.image || "";
          return `
          <article class="product-item">
            <img src="${escapeHtml(imagePath)}" alt="${escapeHtml(product.name || "Product")}" />
            <h4>${escapeHtml(product.name || "-")}</h4>
            <p><strong>${escapeHtml(product.price || "-")}</strong></p>
            <p>${escapeHtml(product.desc || "-")}</p>
            <div class="product-actions">
              <button class="edit-btn" type="button" data-action="edit" data-id="${escapeHtml(product.name)}">Edit</button>
              <button class="delete-btn" type="button" data-action="delete" data-id="${escapeHtml(product.name)}">Hapus</button>
            </div>
          </article>
        `;
        })
        .join("");
    } else {
      showToast(error.message || "Failed to load products.", "error");
    }
  }
}

async function uploadImage(file) {
  const supabase = await getSupabase();
  const bucketName = runtimeConfig?.supabaseStorageBucket || "product-images";
  const safeName = (file?.name || "image")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const objectPath = `products/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName || "image"}`;

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });

  if (uploadError) {
    throw new Error(uploadError.message || "Upload gambar gagal.");
  }

  const { data } = supabase.storage.from(bucketName).getPublicUrl(objectPath);
  const publicUrl = data?.publicUrl || "";
  if (!publicUrl) {
    throw new Error("Response upload tidak memiliki URL publik.");
  }

  return publicUrl;
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
    let localImage = "";
    const file = imageInput.files?.[0];
    if (file) {
      localImage = await fileToDataUrl(file);
      try {
        image = await uploadImage(file);
      } catch (error) {
        image = localImage;
      }
    }

    const supabase = await getSupabase();
    const { error } = await supabase.from(PRODUCTS_TABLE).insert({
      name,
      price,
      desc,
      image
    });
    if (error) throw error;

    upsertLocalProduct(
      {
        name,
        price,
        category: "Misc",
        desc,
        is_new: false,
        color: "#F4A7A7",
        image: localImage || image,
        created_at: new Date().toISOString()
      },
      name
    );

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

  document.getElementById("editProductId").value = product.name || "";
  document.getElementById("editExistingImage").value = product.image || "";
  document.getElementById("editName").value = product.name || "";
  document.getElementById("editPrice").value = product.price || "";
  document.getElementById("editDesc").value = product.desc || "";
  document.getElementById("editImage").value = "";
  showBox(document.getElementById("editErrorBox"), "");
  modal.classList.add("active");
}

async function handleSaveEdit() {
  const id = document.getElementById("editProductId")?.value;
  const existingImage = document.getElementById("editExistingImage")?.value || "";
  const name = document.getElementById("editName")?.value.trim() || "";
  const price = document.getElementById("editPrice")?.value.trim() || "";
  const desc = document.getElementById("editDesc")?.value.trim() || "";
  const imageInput = document.getElementById("editImage");
  const errorBox = document.getElementById("editErrorBox");
  const saveBtn = document.getElementById("saveEditBtn");
  if (!id || !imageInput || !errorBox || !saveBtn) return;

  showBox(errorBox, "");
  saveBtn.disabled = true;

  try {
    if (!name || !price || !desc) {
      throw new Error("Nama, harga, dan deskripsi wajib diisi.");
    }

    let image = existingImage;
    let localImage = "";
    const file = imageInput.files?.[0];
    if (file) {
      localImage = await fileToDataUrl(file);
      try {
        image = await uploadImage(file);
      } catch (error) {
        image = localImage;
      }
    }

    const supabase = await getSupabase();
    const { error } = await supabase
      .from(PRODUCTS_TABLE)
      .update({
        name,
        price,
        desc,
        image
      })
      .eq("name", id);
    if (error) throw error;

    upsertLocalProduct(
      {
        name,
        price,
        category: "Misc",
        desc,
        is_new: false,
        color: "#F4A7A7",
        image: localImage || image || existingImage,
        created_at: new Date().toISOString()
      },
      id
    );

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
  pendingDeleteId = id;
  const deleteName = document.getElementById("deleteProductName");
  const modal = document.getElementById("deleteModal");
  if (deleteName) deleteName.textContent = name || "-";
  if (modal) modal.classList.add("active");
}

async function handleConfirmDelete() {
  const confirmBtn = document.getElementById("confirmDeleteBtn");
  if (!pendingDeleteId || !confirmBtn) return;

  confirmBtn.disabled = true;
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from(PRODUCTS_TABLE).delete().eq("name", pendingDeleteId);
    if (error) throw error;
    removeLocalProduct(pendingDeleteId);

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
  if (modal) modal.classList.remove("active");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

window.getSupabase = getSupabase;
window.showToast = showToast;
window.initLoginPage = initLoginPage;
window.initRegisterPage = initRegisterPage;
window.initDashboardPage = initDashboardPage;
window.loadProducts = loadProducts;
window.uploadImage = uploadImage;
window.handleAddProduct = handleAddProduct;
window.openEditModal = openEditModal;
window.handleSaveEdit = handleSaveEdit;
window.openDeleteModal = openDeleteModal;
window.handleConfirmDelete = handleConfirmDelete;
