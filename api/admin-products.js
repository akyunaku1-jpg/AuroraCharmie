function getEnv(name) {
  return String(process.env[name] || "").trim();
}

function readBearerToken(req) {
  const raw = String(req.headers.authorization || "");
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readJsonBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (error) {
      return {};
    }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}

async function fetchUserProfile(supabaseUrl, anonKey, accessToken) {
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || "Unauthorized.");
  }

  return response.json();
}

async function performProductsWrite(supabaseUrl, serviceRoleKey, action, payload) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
    Prefer: "return=representation"
  };

  if (action === "insert") {
    const response = await fetch(`${supabaseUrl}/rest/v1/products`, {
      method: "POST",
      headers,
      body: JSON.stringify([payload.product || {}])
    });
    return response;
  }

  if (action === "update") {
    const lookupName = String(payload.lookupName || "").trim();
    if (!lookupName) {
      throw new Error("lookupName is required for update.");
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/products?name=eq.${encodeURIComponent(lookupName)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload.product || {})
    });
    return response;
  }

  if (action === "delete") {
    const lookupName = String(payload.lookupName || "").trim();
    if (!lookupName) {
      throw new Error("lookupName is required for delete.");
    }
    const response = await fetch(`${supabaseUrl}/rest/v1/products?name=eq.${encodeURIComponent(lookupName)}`, {
      method: "DELETE",
      headers
    });
    return response;
  }

  throw new Error("Unsupported action.");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const adminEmail = "admin@cherry.com";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    res.status(500).json({ message: "Missing Supabase server environment variables." });
    return;
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ message: "Missing access token." });
    return;
  }

  try {
    const user = await fetchUserProfile(supabaseUrl, anonKey, accessToken);
    const email = String(user?.email || "").toLowerCase();
    if (email !== adminEmail) {
      res.status(403).json({ message: "Only admin can modify products." });
      return;
    }

    const payload = readJsonBody(req);
    const action = String(payload.action || "").toLowerCase();
    const response = await performProductsWrite(supabaseUrl, serviceRoleKey, action, payload);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = Array.isArray(data) ? data[0]?.message : data?.message;
      res.status(response.status).json({ message: message || "Failed to write products." });
      return;
    }

    res.status(200).json({ success: true, data });
  } catch (error) {
    res.status(500).json({ message: error.message || "Admin product operation failed." });
  }
};
