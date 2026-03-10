const PRODUCTS_TABLE = "products";

let pendingDeleteId = null;

function getSupabaseClient() {
  if (!window.supabaseClient) {
    throw new Error("Supabase client is not initialized.");
  }
  return window.supabaseClient;
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

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("Gagal membaca file gambar."));
    reader.readAsDataURL(file);
  });
}

async function initLoginPage() {
  clearAuthMessages();
  const emailInput = document.getElementById("emailInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginBtn = document.getElementById("loginBtn");
  const errorBox = document.getElementById("errorBox");
  if (!emailInput || !passwordInput || !loginBtn || !errorBox) return;

  try {
    const supabase = getSupabaseClient();
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

      const supabase = getSupabaseClient();
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

      const supabase = getSupabaseClient();
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
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from(PRODUCTS_TABLE).select("*").order("created_at", { ascending: false });
    if (error) throw error;

    if (!data || data.length === 0) {
      grid.innerHTML = `<div class="product-item"><p>Belum ada produk</p></div>`;
      return;
    }

    grid.innerHTML = data
      .map((product) => {
        const imagePath = product.image || "";
        return `
          <article class="product-item">
            <img src="${escapeHtml(imagePath)}" alt="${escapeHtml(product.name || "Product")}" />
            <h4>${escapeHtml(product.name || "-")}</h4>
            <p><strong>${escapeHtml(product.price || "-")}</strong></p>
            <p>${escapeHtml(product.description || "-")}</p>
            <div class="product-actions">
              <button class="edit-btn" type="button" data-action="edit" data-id="${escapeHtml(product.id)}">Edit</button>
              <button class="delete-btn" type="button" data-action="delete" data-id="${escapeHtml(product.id)}">Hapus</button>
            </div>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-action='edit']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const product = data.find((item) => String(item.id) === String(btn.dataset.id));
        if (product) openEditModal(product);
      });
    });

    grid.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const product = data.find((item) => String(item.id) === String(btn.dataset.id));
        if (product) openDeleteModal(product.id, product.name || "-");
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
    const description = descInput.value.trim();
    if (!name || !price || !description) {
      throw new Error("Nama, harga, dan deskripsi wajib diisi.");
    }

    let image = "";
    const file = imageInput.files?.[0];
    if (file) {
      image = await fileToDataUrl(file);
    }

    const supabase = getSupabaseClient();
    const productObject = {
      name,
      price,
      description,
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
  document.getElementById("editExistingImage").value = product.image || "";
  document.getElementById("editName").value = product.name || "";
  document.getElementById("editPrice").value = product.price || "";
  document.getElementById("editDesc").value = product.description || "";
  document.getElementById("editImage").value = "";
  showBox(document.getElementById("editErrorBox"), "");
  modal.classList.add("active");
}

async function handleSaveEdit() {
  const productId = document.getElementById("editProductId")?.value;
  const existingImage = document.getElementById("editExistingImage")?.value || "";
  const name = document.getElementById("editName")?.value.trim() || "";
  const price = document.getElementById("editPrice")?.value.trim() || "";
  const description = document.getElementById("editDesc")?.value.trim() || "";
  const imageInput = document.getElementById("editImage");
  const errorBox = document.getElementById("editErrorBox");
  const saveBtn = document.getElementById("saveEditBtn");
  if (!productId || !imageInput || !errorBox || !saveBtn) return;

  showBox(errorBox, "");
  saveBtn.disabled = true;

  try {
    if (!name || !price || !description) {
      throw new Error("Nama, harga, dan deskripsi wajib diisi.");
    }

    let image = existingImage;
    const file = imageInput.files?.[0];
    if (file) {
      image = await fileToDataUrl(file);
    }

    const supabase = getSupabaseClient();
    const productObject = {
      name,
      price,
      description,
      image
    };

    const { error } = await supabase.from(PRODUCTS_TABLE).update(productObject).eq("id", productId);
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
    const supabase = getSupabaseClient();
    const { error } = await supabase.from(PRODUCTS_TABLE).delete().eq("id", pendingDeleteId);
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

async function initDashboardPage() {
  const logoutBtn = document.getElementById("logoutBtn");
  const addProductBtn = document.getElementById("addProductBtn");
  const saveEditBtn = document.getElementById("saveEditBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
  const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");

  try {
    const supabase = getSupabaseClient();
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
        await getSupabaseClient().auth.signOut();
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
