const SUPABASE_URL = "YOUR_SUPABASE_URL";
const SUPABASE_KEY = "YOUR_SUPABASE_ANON_KEY";
const SUPABASE_STORAGE_BUCKET = "product-images";

let __supabaseClient = null;
let __runtimeConfig = null;

async function getSupabaseClient() {
  if (__supabaseClient) {
    return __supabaseClient;
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library is not loaded.");
  }

  try {
    const response = await fetch("/api/config", {
      headers: { Accept: "application/json" }
    });

    if (response.ok) {
      const config = await response.json();
      if (config?.supabaseUrl && config?.supabaseAnonKey) {
        __runtimeConfig = config;
        __supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
        return __supabaseClient;
      }
    }
  } catch (error) {
    // Fallback to constants below.
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_KEY ||
    SUPABASE_URL === "YOUR_SUPABASE_URL" ||
    SUPABASE_KEY === "YOUR_SUPABASE_ANON_KEY"
  ) {
    throw new Error("Supabase runtime config is missing.");
  }

  __supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  return __supabaseClient;
}

function getSupabaseBucket() {
  return __runtimeConfig?.supabaseStorageBucket || SUPABASE_STORAGE_BUCKET;
}

window.getSupabaseClient = getSupabaseClient;
window.getSupabaseBucket = getSupabaseBucket;
