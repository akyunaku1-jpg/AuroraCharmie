(function () {
  const MAX_ATTEMPTS = 30;
  const RETRY_DELAY_MS = 100;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForSupabaseLibrary() {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      if (window.supabase && typeof window.supabase.createClient === "function") {
        return;
      }
      await sleep(RETRY_DELAY_MS);
    }
    throw new Error("Supabase JS library is not loaded.");
  }

  async function loadRuntimeConfig() {
    const response = await fetch("/api/config", { method: "GET", cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to fetch runtime config.");
    }
    return response.json();
  }

  async function initSupabase() {
    try {
      await waitForSupabaseLibrary();
      const config = await loadRuntimeConfig();
      const supabaseUrl = String(config?.supabaseUrl || "").trim();
      const supabaseAnonKey = String(config?.supabaseAnonKey || "").trim();
      const supabaseStorageBucket = String(config?.supabaseStorageBucket || "product-images").trim();

      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is missing.");
      }

      window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
      window.supabaseProjectUrl = supabaseUrl;
      window.supabaseStorageBucket = supabaseStorageBucket || "product-images";
    } catch (error) {
      window.supabaseInitError = error;
      console.error("Supabase initialization failed.", error);
    }
  }

  initSupabase();
})();
