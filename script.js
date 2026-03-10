const localProducts = [
  {
    name: "Cherry Bloom",
    price: "Rp 35.000",
    category: "Cherry",
    desc: "Sweet and playful red cherry bead bracelet.",
    isNew: false,
    color: "#F4A7A7",
    // Replace this URL with your real product photo later
    image: "https://i.pinimg.com/736x/63/a4/85/63a4851f46c293cd70b0b2b0483d0a24.jpg"
  },
  {
    name: "Daisy Charm",
    price: "Rp 40.000",
    category: "Flower",
    desc: "White daisy flower bracelet with gold beads.",
    isNew: false,
    color: "#FFE4B5",
    // Replace this URL with your real product photo later
    image: "https://source.unsplash.com/400x300/?bracelet,flower,daisy"
  },
  {
    name: "Cloudy Heart",
    price: "Rp 32.000",
    category: "Heart",
    desc: "Soft pastel heart bracelet in lavender and pink.",
    isNew: true,
    color: "#E8D5F5",
    // Replace this URL with your real product photo later
    image: "https://source.unsplash.com/400x300/?bracelet,heart,pastel"
  },
  {
    name: "Mellow Beads",
    price: "Rp 38.000",
    category: "Mix",
    desc: "A cheerful mix of colorful beads.",
    isNew: false,
    color: "#FFD6A5",
    // Replace this URL with your real product photo later
    image: "https://source.unsplash.com/400x300/?bracelet,colorful,beads"
  },
  {
    name: "Sakura Pearl",
    price: "Rp 45.000",
    category: "Pastel",
    desc: "Pastel pearl beads in soft pink tones.",
    isNew: true,
    color: "#FADADD",
    // Replace this URL with your real product photo later
    image: "https://source.unsplash.com/400x300/?bracelet,pearl,pink"
  },
  {
    name: "Berry Twist",
    price: "Rp 33.000",
    category: "Cherry",
    desc: "Cherry bracelet with a purple and pink twist.",
    isNew: false,
    color: "#DDA0DD",
    // Replace this URL with your real product photo later
    image: "https://source.unsplash.com/400x300/?bracelet,purple,beads"
  }
];

const WA_NUMBER = "6281234567890";
const FALLBACK_TEXT_COLOR = "#8b3c44";
const PRODUCTS_TABLE = "products";
const BADGE_OPTIONS = ["NEW", "SALE", "HOT", "LIMITED"];
const LOCAL_PRODUCTS_KEY = "aurora_products";

const productGrid = document.getElementById("productGrid");
const filterGroup = document.getElementById("filterGroup");
const searchInput = document.getElementById("searchInput");
const modal = document.getElementById("productModal");
const modalBody = document.getElementById("modalBody");
const modalCloseBtn = document.getElementById("modalCloseBtn");
const toast = document.getElementById("toast");
const loadingScreen = document.getElementById("loadingScreen");
const mainContent = document.getElementById("mainContent");
const mobileMenuBtn = document.getElementById("mobileMenuBtn");
const mobileMenu = document.getElementById("mobileMenu");
const floatingWhatsapp = document.getElementById("floatingWhatsapp");
const themeToggle = document.getElementById("themeToggle");
const orderForm = document.getElementById("orderForm");
const customerNameInput = document.getElementById("customerName");
const productNameInput = document.getElementById("productName");
const templateText = document.getElementById("templateText");
const copyTemplateBtn = document.getElementById("copyTemplateBtn");
const chatTemplateBtn = document.getElementById("chatTemplateBtn");

let products = [...localProducts];
let currentFilter = "All";
let currentSearch = "";
let isProductGridLoading = false;
let supabaseClientPromise = null;
let productsRealtimeChannel = null;

function parseBadgeFromDescription(rawDescription) {
  const text = typeof rawDescription === "string" ? rawDescription.trim() : "";
  const match = text.match(/^\[badge:([A-Za-z0-9_-]{1,16})\]\s*/i);
  if (!match) {
    return {
      badge: "",
      description: text
    };
  }

  const candidate = (match[1] || "").toUpperCase();
  const badge = BADGE_OPTIONS.includes(candidate) ? candidate : "";
  return {
    badge,
    description: text.slice(match[0].length).trim()
  };
}

const CARD_SWITCH_DURATION_MS = 300;
const MIN_SKELETON_CARDS = 4;

function normalizeProduct(product) {
  const parsedDescription = parseBadgeFromDescription(product?.description || product?.desc || "");
  const imagePath = product?.image_path || product?.image || product?.images || "";
  const defaultBadge = product?.is_new ?? product?.isNew ? "NEW" : "";

  return {
    id: product?.id || null,
    name: product?.name || "Unnamed Product",
    price: product?.price || "Rp 0",
    category: product?.category || "Misc",
    desc: parsedDescription.description,
    badge: parsedDescription.badge || defaultBadge,
    isNew: Boolean(product?.is_new ?? product?.isNew) || Boolean(parsedDescription.badge),
    color: product?.color || "#F4A7A7",
    image: imagePath
  };
}

function readLocalProducts() {
  try {
    const raw = window.localStorage.getItem(LOCAL_PRODUCTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeLocalProducts(items) {
  try {
    window.localStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(items));
  } catch (error) {
    // Ignore localStorage quota/access errors.
  }
}

async function getSupabaseClient() {
  if (supabaseClientPromise) {
    return supabaseClientPromise;
  }

  supabaseClientPromise = (async () => {
    if (typeof window.getSupabaseClient !== "function") {
      if (!window.supabase || typeof window.supabase.createClient !== "function") {
        throw new Error("Supabase client library is missing.");
      }
      const response = await fetch("/api/config", { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error("Failed to read runtime config.");
      }
      const config = await response.json();
      if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
        throw new Error("Supabase runtime config is incomplete.");
      }
      return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    }
    return window.getSupabaseClient();
  })();

  return supabaseClientPromise;
}

async function loadProducts() {
  try {
    const supabase = await getSupabaseClient();

    let data = [];
    const primaryResult = await supabase
      .from(PRODUCTS_TABLE)
      .select("id,name,price,category,description,is_new,color,image,created_at")
      .order("created_at", { ascending: false });

    if (!primaryResult.error) {
      data = primaryResult.data || [];
    } else {
      const fallbackResult = await supabase
        .from(PRODUCTS_TABLE)
        .select("id,name,price,category,desc,is_new,color,image,images,created_at")
        .order("created_at", { ascending: false });

      if (fallbackResult.error) {
        throw fallbackResult.error;
      }

      data = fallbackResult.data || [];
    }

    products = Array.isArray(data) ? data.map(normalizeProduct) : [];
    writeLocalProducts(products);
  } catch (error) {
    const localProductsData = readLocalProducts();
    products = localProductsData.length > 0 ? localProductsData.map(normalizeProduct) : [...localProducts];
  }
}

async function subscribeToProductChanges() {
  if (!productGrid || productsRealtimeChannel) {
    return;
  }

  try {
    const supabase = await getSupabaseClient();
    productsRealtimeChannel = supabase
      .channel("aurora-products-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: PRODUCTS_TABLE },
        async () => {
          await loadProducts();
          renderProducts();
        }
      )
      .subscribe();

    window.addEventListener("beforeunload", () => {
      if (productsRealtimeChannel) {
        supabase.removeChannel(productsRealtimeChannel);
        productsRealtimeChannel = null;
      }
    });
  } catch (error) {
    // Keep catalog functional even if realtime is unavailable.
  }
}

function renderProductPlaceholder(color, name) {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="${name}">
      <rect width="400" height="300" fill="${color}"/>
      <circle cx="120" cy="140" r="42" fill="rgba(255,255,255,0.62)" />
      <circle cx="196" cy="124" r="30" fill="rgba(255,255,255,0.48)" />
      <circle cx="248" cy="178" r="38" fill="rgba(255,255,255,0.62)" />
      <text x="26" y="265" fill="${FALLBACK_TEXT_COLOR}" font-size="28" font-family="Nunito, sans-serif">Aurora Charmie 🍒</text>
    </svg>
  `;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function handleImageError(imgElement, color, name) {
  imgElement.onerror = null;
  imgElement.src = renderProductPlaceholder(color, name);
}

window.handleImageError = handleImageError;

function getImageSource(product) {
  if (product.image && product.image.trim() !== "") {
    return product.image;
  }
  return renderProductPlaceholder(product.color, product.name);
}

function getProductImageMarkup(product, className) {
  return `<img class="${className}" src="${getImageSource(product)}" alt="${product.name}" onerror="handleImageError(this, '${product.color}', '${product.name.replace(/'/g, "\\'")}')" />`;
}

function productCardTemplate(product, index) {
  const badgeText = product.badge || (product.isNew ? "NEW" : "");
  return `
    <article class="product-card reveal" data-id="${index}">
      ${getProductImageMarkup(product, "product-image")}
      <div class="product-body">
        <div class="badge-row">
          <span class="badge">${product.category}</span>
          ${badgeText ? `<span class="badge new">${badgeText}</span>` : ""}
        </div>
        <h3 class="product-name">${product.name}</h3>
        <p class="product-price">${product.price}</p>
        <p class="product-desc">${product.desc}</p>
        <button class="view-btn" data-view-id="${index}">View →</button>
      </div>
    </article>
  `;
}

function productSkeletonTemplate() {
  return `
    <article class="product-card skeleton-card">
      <div class="skeleton-image" aria-hidden="true"></div>
      <div class="product-body" aria-hidden="true">
        <div class="skeleton-line long"></div>
        <div class="skeleton-line short"></div>
      </div>
    </article>
  `;
}

function renderSkeletonCards(count) {
  const safeCount = Math.max(Number(count) || 0, MIN_SKELETON_CARDS);
  return Array.from({ length: safeCount }, () => productSkeletonTemplate()).join("");
}

function showToast(message) {
  if (!toast) {
    return;
  }
  toast.textContent = message;
  toast.classList.remove("show");
  void toast.offsetWidth;
  toast.classList.add("show");
}

function makeProductMessage(product) {
  return `Halo kak Aurora Charmie! 🍒 Saya mau pesan ${product.name} seharga ${product.price} 😊`;
}

function getFilteredProducts() {
  return products
    .map((product, index) => ({ ...product, _index: index }))
    .filter((product) => {
      const categoryMatch =
        currentFilter === "All" || product.category.toLowerCase() === currentFilter.toLowerCase();
      const searchMatch = product.name.toLowerCase().includes(currentSearch.toLowerCase().trim());
      return categoryMatch && searchMatch;
    });
}

function renderProducts() {
  if (!productGrid) {
    return;
  }

  const filtered = getFilteredProducts();
  isProductGridLoading = true;
  productGrid.innerHTML = renderSkeletonCards(filtered.length);
  productGrid.classList.remove("is-switching");

  setTimeout(() => {
    productGrid.classList.add("is-switching");

    setTimeout(() => {
    productGrid.innerHTML = filtered.map((product) => productCardTemplate(product, product._index)).join("");
    isProductGridLoading = false;
    productGrid.classList.remove("is-switching");
    initRevealObserver();
    }, CARD_SWITCH_DURATION_MS);
  }, 0);
}

function openProductModal(productIndex) {
  if (!modal || !modalBody) {
    return;
  }

  const product = products[Number(productIndex)];
  if (!product) {
    return;
  }

  const badgeText = product.badge || (product.isNew ? "NEW" : "");
  const waMessage = makeProductMessage(product);
  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMessage)}`;
  const shareText = `${product.name} - ${product.price} | ${product.desc}`;

  modalBody.innerHTML = `
    ${getProductImageMarkup(product, "modal-product-image")}
    <h3>${product.name}</h3>
    <p><strong>${product.price}</strong></p>
    <p>${product.desc}</p>
    <div class="badge-row">
      <span class="badge">${product.category}</span>
      ${badgeText ? `<span class="badge new">${badgeText}</span>` : ""}
    </div>
    <div class="modal-actions">
      <a class="pill-btn" href="${waLink}" target="_blank" rel="noopener noreferrer">Order via WhatsApp →</a>
      <button id="shareProductBtn" class="ghost-btn">🔗 Bagikan Produk</button>
    </div>
  `;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  const shareProductBtn = document.getElementById("shareProductBtn");
  if (shareProductBtn) {
    shareProductBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(shareText);
        showToast("Link disalin! ✓");
      } catch (error) {
        showToast("Gagal menyalin. Coba lagi.");
      }
    });
  }
}

function closeModal() {
  if (!modal) {
    return;
  }
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function initRevealObserver() {
  const revealElements = document.querySelectorAll(".reveal:not(.visible)");
  const observer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  revealElements.forEach((item) => observer.observe(item));
}

function updateTemplateText() {
  if (!templateText || !chatTemplateBtn || !customerNameInput || !productNameInput) {
    return;
  }
  const customerName = customerNameInput.value.trim() || "[Nama kamu]";
  const productName = productNameInput.value.trim() || "[Nama produk]";
  const text = `Halo kak Aurora Charmie! 🍒
Saya ${customerName}, mau pesan ${productName}.
Boleh info ketersediaan, detail pembayaran, dan estimasi pengiriman ya? 😊
Terima kasih!`;

  templateText.value = text;
  chatTemplateBtn.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(text)}`;
}

function setupTheme() {
  if (!themeToggle) {
    return;
  }

  const savedTheme = sessionStorage.getItem("aurora_theme");
  if (savedTheme === "dark") {
    document.body.classList.add("dark");
    themeToggle.textContent = "☀️";
  }

  themeToggle.addEventListener("click", () => {
    const isDark = document.body.classList.toggle("dark");
    themeToggle.textContent = isDark ? "☀️" : "🌙";
    sessionStorage.setItem("aurora_theme", isDark ? "dark" : "light");
  });
}

function applyActiveNavLink() {
  const currentPath = window.location.pathname;
  const currentFile = currentPath.endsWith("/") ? "index.html" : currentPath.split("/").pop();
  const navLinks = document.querySelectorAll(".nav-links a, .mobile-menu a");
  navLinks.forEach((link) => {
    const href = link.getAttribute("href");
    if (href === currentFile) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

function setupMenu() {
  if (!mobileMenuBtn || !mobileMenu) {
    return;
  }

  mobileMenuBtn.addEventListener("click", () => {
    const isOpen = mobileMenu.classList.toggle("open");
    mobileMenuBtn.setAttribute("aria-expanded", String(isOpen));
  });

  const allNavLinks = document.querySelectorAll(".nav-links a, .mobile-menu a, .brand");
  allNavLinks.forEach((link) => {
    link.addEventListener("click", () => {
      mobileMenu.classList.remove("open");
      mobileMenuBtn.setAttribute("aria-expanded", "false");
    });
  });
}

function ensurePageLoadingOverlay() {
  if (loadingScreen) {
    return loadingScreen;
  }

  const overlay = document.createElement("div");
  overlay.id = "pageLoadingOverlay";
  overlay.className = "loading-screen hide";
  overlay.innerHTML = `
    <h1>Aurora Charmie 🍒</h1>
    <div class="loading-dots" aria-hidden="true"><span></span><span></span><span></span></div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function setupNavigationLoading() {
  const pageOverlay = ensurePageLoadingOverlay();
  const internalLinks = document.querySelectorAll("a[href$='.html']");

  internalLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = link.getAttribute("target");
      if (target && target !== "_self") {
        return;
      }

      pageOverlay.classList.remove("hide");
    });
  });
}

function setupCatalogEvents() {
  if (!filterGroup || !searchInput || !productGrid) {
    return;
  }

  filterGroup.addEventListener("click", (event) => {
    const btn = event.target.closest(".filter-btn");
    if (!btn) {
      return;
    }
    document.querySelectorAll(".filter-btn").forEach((item) => item.classList.remove("active"));
    btn.classList.add("active");
    currentFilter = btn.dataset.filter;
    renderProducts();
  });

  searchInput.addEventListener("input", (event) => {
    currentSearch = event.target.value;
    renderProducts();
  });

  productGrid.addEventListener("click", (event) => {
    if (isProductGridLoading) {
      return;
    }

    const viewBtn = event.target.closest("[data-view-id]");
    if (!viewBtn) {
      return;
    }
    openProductModal(viewBtn.dataset.viewId);
  });
}

function setupModalEvents() {
  if (!modal) {
    return;
  }

  modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal='true']")) {
      closeModal();
    }
  });

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeModal);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("open")) {
      closeModal();
    }
  });
}

function setupOrderEvents() {
  if (!orderForm || !customerNameInput || !productNameInput || !copyTemplateBtn) {
    return;
  }

  orderForm.addEventListener("submit", (event) => {
    event.preventDefault();
    updateTemplateText();
    window.open(chatTemplateBtn.href, "_blank", "noopener,noreferrer");
  });

  customerNameInput.addEventListener("input", updateTemplateText);
  productNameInput.addEventListener("input", updateTemplateText);

  copyTemplateBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(templateText.value);
      showToast("Link disalin! ✓");
    } catch (error) {
      showToast("Gagal menyalin. Coba lagi.");
    }
  });
}

function setupFloatingWhatsapp() {
  if (!floatingWhatsapp) {
    return;
  }

  floatingWhatsapp.addEventListener("click", () => {
    window.open(`https://wa.me/${WA_NUMBER}`, "_blank", "noopener,noreferrer");
  });
}

function showLoadingThenReveal() {
  if (!mainContent) {
    return;
  }

  const isHome = document.body.dataset.page === "home";
  if (!isHome) {
    mainContent.style.opacity = "1";
    initRevealObserver();
    return;
  }

  if (!loadingScreen) {
    mainContent.classList.remove("hidden-initially");
    mainContent.style.opacity = "1";
    initRevealObserver();
    return;
  }

  const hasShownInSession = sessionStorage.getItem("aurora_home_loaded") === "true";
  if (hasShownInSession) {
    loadingScreen.classList.add("hide");
    mainContent.classList.remove("hidden-initially");
    mainContent.style.opacity = "1";
    initRevealObserver();
    return;
  }

  sessionStorage.setItem("aurora_home_loaded", "true");
  setTimeout(() => {
    loadingScreen.classList.add("hide");
    mainContent.classList.remove("hidden-initially");
    mainContent.style.opacity = "1";
    initRevealObserver();
  }, 1500);
}

async function init() {
  applyActiveNavLink();
  setupTheme();
  setupMenu();
  setupNavigationLoading();
  setupFloatingWhatsapp();
  setupCatalogEvents();
  setupModalEvents();
  setupOrderEvents();

  if (productGrid) {
    isProductGridLoading = true;
    productGrid.innerHTML = renderSkeletonCards(products.length);
  }

  await loadProducts();
  renderProducts();
  await subscribeToProductChanges();
  updateTemplateText();
  showLoadingThenReveal();
}

init();
