const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE_DIR = __dirname;
const ASSETS_DIR = path.join(BASE_DIR, "assets");
const PRODUCT_IMAGES_DIR = path.join(BASE_DIR, "public", "product-images");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const MIME_TYPES = {
  ".html": "text/html; charset=UTF-8",
  ".css": "text/css; charset=UTF-8",
  ".js": "application/javascript; charset=UTF-8",
  ".json": "application/json; charset=UTF-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml"
};

const STATIC_ROUTES = {
  "/": "index.html",
  "/index.html": "index.html",
  "/catalog.html": "catalog.html",
  "/info.html": "info.html",
  "/order.html": "order.html",
  "/style.css": "style.css",
  "/script.js": "script.js",
  "/admin": "admin.html",
  "/admin.html": "admin.html",
  "/admin-login": "admin-login.html",
  "/admin-login.html": "admin-login.html",
  "/admin-register": "admin-register.html",
  "/admin-dashboard": "admin-dashboard.html",
  "/admin.js": "admin.js",
  "/supabase.js": "supabase.js",
  "/admin.css": "admin.css"
};

function loadEnvFromFile(fileName) {
  const envPath = path.join(BASE_DIR, fileName);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

loadEnvFromFile(".env.local");
loadEnvFromFile(".env");
const PORT = Number(process.env.PORT || 3005);

fs.mkdirSync(PRODUCT_IMAGES_DIR, { recursive: true });

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=UTF-8" });
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { "Content-Type": "text/plain; charset=UTF-8" });
  res.end(message);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "404 Not Found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
}

function sanitizeBaseName(fileName) {
  const base = path.basename(fileName, path.extname(fileName));
  const safe = base.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return safe || "product";
}

function detectFileExtension(originalName, mimeType) {
  const extFromName = path.extname(originalName || "").toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extFromName)) {
    return extFromName;
  }

  if (mimeType === "image/jpeg") {
    return ".jpg";
  }
  if (mimeType === "image/png") {
    return ".png";
  }
  if (mimeType === "image/webp") {
    return ".webp";
  }
  return "";
}

function parseMultipart(req, contentType) {
  return new Promise((resolve, reject) => {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
    if (!boundary) {
      reject(new Error("Invalid multipart boundary."));
      return;
    }

    const chunks = [];
    let totalSize = 0;
    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_UPLOAD_BYTES) {
        reject(new Error("Upload exceeds maximum size (10MB)."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const boundaryBuffer = Buffer.from(`--${boundary}`);
      const headerSeparator = Buffer.from("\r\n\r\n");
      const fileResult = { fileName: "", mimeType: "", buffer: null };

      let searchFrom = 0;
      while (searchFrom < body.length) {
        const boundaryIndex = body.indexOf(boundaryBuffer, searchFrom);
        if (boundaryIndex === -1) {
          break;
        }

        const partStart = boundaryIndex + boundaryBuffer.length;
        const isFinalBoundary = body.slice(partStart, partStart + 2).toString() === "--";
        if (isFinalBoundary) {
          break;
        }

        const contentStart = partStart + 2;
        const nextBoundaryIndex = body.indexOf(boundaryBuffer, contentStart);
        if (nextBoundaryIndex === -1) {
          break;
        }

        const partBuffer = body.slice(contentStart, nextBoundaryIndex - 2);
        const headerEnd = partBuffer.indexOf(headerSeparator);
        if (headerEnd === -1) {
          searchFrom = nextBoundaryIndex;
          continue;
        }

        const headersRaw = partBuffer.slice(0, headerEnd).toString("utf8");
        const valueBuffer = partBuffer.slice(headerEnd + headerSeparator.length);
        const dispositionLine = headersRaw
          .split("\r\n")
          .find((line) => line.toLowerCase().startsWith("content-disposition:"));
        const typeLine = headersRaw
          .split("\r\n")
          .find((line) => line.toLowerCase().startsWith("content-type:"));

        if (!dispositionLine) {
          searchFrom = nextBoundaryIndex;
          continue;
        }

        const fieldNameMatch = dispositionLine.match(/name="([^"]+)"/i);
        const fileNameMatch = dispositionLine.match(/filename="([^"]*)"/i);
        const fieldName = fieldNameMatch?.[1] || "";
        const fileName = fileNameMatch?.[1] || "";

        if (fieldName === "image" && fileName) {
          fileResult.fileName = fileName;
          fileResult.mimeType = typeLine ? typeLine.replace(/content-type:/i, "").trim() : "";
          fileResult.buffer = valueBuffer;
          resolve(fileResult);
          return;
        }

        searchFrom = nextBoundaryIndex;
      }

      reject(new Error("No image file field found."));
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

async function handleImageUpload(req, res) {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.startsWith("multipart/form-data")) {
    sendJson(res, 400, { message: "Content-Type must be multipart/form-data." });
    return;
  }

  try {
    const uploaded = await parseMultipart(req, contentType);
    const extension = detectFileExtension(uploaded.fileName, uploaded.mimeType);
    if (!extension) {
      sendJson(res, 400, { message: "Unsupported file type. Use JPG, PNG, or WEBP." });
      return;
    }

    const baseName = sanitizeBaseName(uploaded.fileName);
    const randomPart = crypto.randomBytes(6).toString("hex");
    const finalName = `${Date.now()}-${baseName}-${randomPart}${extension}`;
    const destinationPath = path.join(PRODUCT_IMAGES_DIR, finalName);
    fs.writeFileSync(destinationPath, uploaded.buffer);

    sendJson(res, 200, { path: `/public/product-images/${finalName}` });
  } catch (error) {
    sendJson(res, 400, { message: error.message || "Image upload failed." });
  }
}

function readJsonBody(req, maxBytes = MAX_UPLOAD_BYTES * 2) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalSize = 0;

    req.on("data", (chunk) => {
      totalSize += chunk.length;
      if (totalSize > maxBytes) {
        reject(new Error("Payload too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    req.on("error", (error) => reject(error));
  });
}

function readBearerToken(req) {
  const raw = String(req.headers.authorization || "");
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function fetchSupabaseUser(accessToken) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
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

function encodePathSegments(value) {
  return String(value || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function handleAdminProductsApi(req, res) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const adminEmail = "admin@cherry.com";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    sendJson(res, 500, { message: "Missing Supabase server environment variables." });
    return;
  }

  const accessToken = readBearerToken(req);

  if (req.method === "GET") {
    let userEmail = "";
    let isAdmin = false;
    let authStatus = "missing_token";

    if (accessToken) {
      try {
        const user = await fetchSupabaseUser(accessToken);
        userEmail = String(user?.email || "").toLowerCase();
        isAdmin = userEmail === adminEmail;
        authStatus = "ok";
      } catch (error) {
        authStatus = "invalid_token";
      }
    }

    sendJson(res, 200, {
      ok: true,
      env: {
        hasSupabaseUrl: Boolean(supabaseUrl),
        hasSupabaseAnonKey: Boolean(anonKey),
        hasSupabaseServiceRoleKey: Boolean(serviceRoleKey)
      },
      auth: {
        status: authStatus,
        userEmail: userEmail || null,
        isAdmin
      },
      adminEmail
    });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." });
    return;
  }

  if (!accessToken) {
    sendJson(res, 401, { message: "Missing access token." });
    return;
  }

  try {
    const user = await fetchSupabaseUser(accessToken);
    const email = String(user?.email || "").toLowerCase();
    if (email !== adminEmail) {
      sendJson(res, 403, { message: "Only admin can modify products." });
      return;
    }

    const payload = await readJsonBody(req);
    const action = String(payload.action || "").toLowerCase();
    const headers = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    };

    let response;
    if (action === "insert") {
      response = await fetch(`${supabaseUrl}/rest/v1/products`, {
        method: "POST",
        headers,
        body: JSON.stringify([payload.product || {}])
      });
    } else if (action === "update") {
      const lookupName = String(payload.lookupName || "").trim();
      if (!lookupName) {
        sendJson(res, 400, { message: "lookupName is required for update." });
        return;
      }
      response = await fetch(`${supabaseUrl}/rest/v1/products?name=eq.${encodeURIComponent(lookupName)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(payload.product || {})
      });
    } else if (action === "delete") {
      const lookupName = String(payload.lookupName || "").trim();
      if (!lookupName) {
        sendJson(res, 400, { message: "lookupName is required for delete." });
        return;
      }
      response = await fetch(`${supabaseUrl}/rest/v1/products?name=eq.${encodeURIComponent(lookupName)}`, {
        method: "DELETE",
        headers
      });
    } else {
      sendJson(res, 400, { message: "Unsupported action." });
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = Array.isArray(data) ? data[0]?.message : data?.message;
      sendJson(res, response.status, { message: message || "Failed to write products." });
      return;
    }

    sendJson(res, 200, { success: true, data });
  } catch (error) {
    sendJson(res, 500, { message: error.message || "Admin product operation failed." });
  }
}

async function handleAdminUploadImageApi(req, res) {
  if (req.method !== "POST") {
    sendJson(res, 405, { message: "Method not allowed." });
    return;
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim();
  const anonKey = String(process.env.SUPABASE_ANON_KEY || "").trim();
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const bucket = String(process.env.SUPABASE_STORAGE_BUCKET || "product-images").trim() || "product-images";
  const adminEmail = "admin@cherry.com";

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    sendJson(res, 500, { message: "Missing Supabase server environment variables." });
    return;
  }

  const accessToken = readBearerToken(req);
  if (!accessToken) {
    sendJson(res, 401, { message: "Missing access token." });
    return;
  }

  try {
    const user = await fetchSupabaseUser(accessToken);
    const email = String(user?.email || "").toLowerCase();
    if (email !== adminEmail) {
      sendJson(res, 403, { message: "Only admin can upload images." });
      return;
    }

    const payload = await readJsonBody(req);
    const base64 = String(payload.base64 || "");
    const fileName = String(payload.fileName || "image");
    const mimeType = String(payload.mimeType || "application/octet-stream");
    if (!base64) {
      sendJson(res, 400, { message: "Image payload is empty." });
      return;
    }

    const bytes = Buffer.from(base64, "base64");
    const objectPath = buildStorageObjectPath(fileName);
    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePathSegments(objectPath)}`,
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
      sendJson(res, uploadResponse.status, { message });
      return;
    }

    const publicUrl = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(
      bucket
    )}/${encodePathSegments(objectPath)}`;
    sendJson(res, 200, {
      success: true,
      path: objectPath,
      publicUrl
    });
  } catch (error) {
    sendJson(res, 500, { message: error.message || "Image upload failed." });
  }
}

const server = http.createServer(async (req, res) => {
  const requestPath = req.url.split("?")[0];

  if (requestPath === "/api/config") {
    sendJson(res, 200, {
      supabaseUrl: process.env.SUPABASE_URL || "",
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || "",
      supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET || "product-images"
    });
    return;
  }

  if (requestPath === "/api/admin-products") {
    await handleAdminProductsApi(req, res);
    return;
  }

  if (requestPath === "/api/admin-upload-image") {
    await handleAdminUploadImageApi(req, res);
    return;
  }

  if (requestPath === "/upload-image" && req.method === "POST") {
    await handleImageUpload(req, res);
    return;
  }

  if (requestPath.startsWith("/public/product-images/")) {
    const safeAssetName = path.basename(requestPath);
    const filePath = path.join(PRODUCT_IMAGES_DIR, safeAssetName);
    const extension = path.extname(filePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      sendText(res, 404, "404 Not Found");
      return;
    }

    serveFile(res, filePath);
    return;
  }

  if (STATIC_ROUTES[requestPath]) {
    const filePath = path.join(BASE_DIR, STATIC_ROUTES[requestPath]);
    serveFile(res, filePath);
    return;
  }

  if (requestPath.startsWith("/assets/")) {
    const safeAssetName = path.basename(requestPath);
    const filePath = path.join(ASSETS_DIR, safeAssetName);
    const ext = path.extname(filePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
      sendText(res, 404, "404 Not Found");
      return;
    }

    serveFile(res, filePath);
    return;
  }

  sendText(res, 404, "404 Not Found");
});

server.listen(PORT, () => {
  const hasSupabaseEnv = Boolean(process.env.SUPABASE_URL) && Boolean(process.env.SUPABASE_ANON_KEY);
  const source = hasSupabaseEnv ? "Supabase config loaded" : "missing Supabase config";
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Runtime config: ${source}`);
});
