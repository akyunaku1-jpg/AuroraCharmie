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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed." });
    return;
  }

  const supabaseUrl = getEnv("SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
  const bucket = getEnv("SUPABASE_STORAGE_BUCKET") || "product-images";
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
      res.status(403).json({ message: "Only admin can upload images." });
      return;
    }

    const payload = readJsonBody(req);
    const base64 = String(payload.base64 || "");
    const fileName = String(payload.fileName || "image");
    const mimeType = String(payload.mimeType || "application/octet-stream");
    if (!base64) {
      res.status(400).json({ message: "Image payload is empty." });
      return;
    }

    const bytes = Buffer.from(base64, "base64");
    const objectPath = buildStorageObjectPath(fileName);
    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath
        .split("/")
        .map((part) => encodeURIComponent(part))
        .join("/")}`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": mimeType,
          "x-upsert": "false"
        },
        body: bytes
      }
    );

    const uploadPayload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) {
      const message = uploadPayload?.message || "Failed to upload image.";
      res.status(uploadResponse.status).json({ message });
      return;
    }

    const publicUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(
      bucket
    )}/${objectPath
      .split("/")
      .map((part) => encodeURIComponent(part))
      .join("/")}`;

    res.status(200).json({
      success: true,
      path: objectPath,
      publicUrl
    });
  } catch (error) {
    res.status(500).json({ message: error.message || "Image upload failed." });
  }
};
