const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function firebaseProjectId() {
  try {
    return process.env.REACT_APP_FIREBASE_PROJECT_ID || JSON.parse(localStorage.getItem("denlight-firebase-config") || "{}").projectId || "";
  } catch (error) {
    return process.env.REACT_APP_FIREBASE_PROJECT_ID || "";
  }
}

function getUserId() {
  let id = localStorage.getItem("denlight-user-id");
  if (!id) {
    id = `denlight-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
    localStorage.setItem("denlight-user-id", id);
  }
  return id;
}

function authHeaders() {
  const token = localStorage.getItem("denlight-firebase-token");
  const projectId = firebaseProjectId();
  return token ? { Authorization: `Bearer ${token}`, "X-Firebase-Project-Id": projectId } : {};
}

function exposeSafeRequestDebug(path, options) {
  if (typeof window === "undefined") return;
  let body = {};
  try {
    body = options.body ? JSON.parse(options.body) : {};
  } catch (error) {
    body = {};
  }
  window.__DENLIGHT_LAST_REQUEST__ = {
    path,
    method: options.method || "GET",
    providerKeyNames: Object.keys(body.provider_keys || {}),
    hasProviderKeys: Object.keys(body.provider_keys || {}).length > 0,
  };
}

async function request(path, options = {}) {
  exposeSafeRequestDebug(path, options);
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": getUserId(),
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let detail = text || "Request failed";
    try {
      detail = JSON.parse(text).detail || detail;
    } catch (error) {
      detail = text || "Request failed";
    }
    throw new Error(detail);
  }
  return response.json();
}

export const api = {
  workspace: () => request("/workspace"),
  profile: (payload) => request("/profile", { method: "POST", body: JSON.stringify(payload) }),
  preferences: (payload) => request("/preferences", { method: "POST", body: JSON.stringify(payload) }),
  createChat: (payload) => request("/chats", { method: "POST", body: JSON.stringify(payload) }),
  getChat: (id) => request(`/chats/${id}`),
  renameChat: (id, title) => request(`/chats/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteChat: (id) => request(`/chats/${id}`, { method: "DELETE" }),
  resetChat: (id) => request(`/chats/${id}/reset`, { method: "POST", body: JSON.stringify({}) }),
  inviteHermes: (id) => request(`/chats/${id}/invite-hermes`, { method: "POST", body: JSON.stringify({}) }),
  sendMessage: (chatId, payload) => request(`/chats/${chatId}/messages`, { method: "POST", body: JSON.stringify(payload) }),
  updateAgent: (id, payload) => request(`/agents/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  createAgent: (payload) => request("/agents", { method: "POST", body: JSON.stringify(payload) }),
  gallery: (payload) => request("/gallery", { method: "POST", body: JSON.stringify(payload) }),
  exportChat: (id) => request(`/export/${id}`),
  firebaseLogin: (payload) => request("/auth/firebase-login", { method: "POST", body: JSON.stringify(payload) }),
  keyStatus: () => request("/keys/status"),
  saveKey: (payload) => request("/keys/upsert", { method: "POST", body: JSON.stringify(payload) }),
  deleteKey: (service) => request(`/keys/${service}`, { method: "DELETE" }),
  telegramConfig: (payload) => request("/telegram/config", { method: "POST", body: JSON.stringify(payload) }),
  telegramSend: (payload) => request("/telegram/send", { method: "POST", body: JSON.stringify(payload) }),
  telegramPoll: (payload) => request("/telegram/poll", { method: "POST", body: JSON.stringify(payload) }),
  telegramSetWebhook: (payload) => request("/telegram/set-webhook", { method: "POST", body: JSON.stringify(payload) }),
  generateImage: (payload) => request("/ai/generate-image", { method: "POST", body: JSON.stringify(payload) }),
  generateImageGemini: (payload) => request("/ai/generate-image/gemini", { method: "POST", body: JSON.stringify(payload) }),
  generateMusic: (payload) => request("/ai/generate-music", { method: "POST", body: JSON.stringify(payload) }),
  generateVideo: (payload) => request("/ai/generate-video", { method: "POST", body: JSON.stringify(payload) }),
  speak: (payload) => request("/voice/speak", { method: "POST", body: JSON.stringify(payload) }),
  voices: () => request("/voice/voices"),
  transcribe: async (file) => {
    const form = new FormData();
    form.append("file", file, file.name || "voice.webm");
    const response = await fetch(`${API}/ai/transcribe`, {
      method: "POST",
      headers: { "X-User-Id": getUserId(), ...authHeaders() },
      body: form,
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Transcription failed" }));
      throw new Error(error.detail || "Transcription failed");
    }
    return response.json();
  },
  getNotes: () => request("/notes"),
  createNote: (payload) => request("/notes", { method: "POST", body: JSON.stringify(payload) }),
  updateNote: (id, payload) => request(`/notes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteNote: (id) => request(`/notes/${id}`, { method: "DELETE" }),
  getLibrary: () => request("/library"),
  createLibraryEntry: (payload) => request("/library", { method: "POST", body: JSON.stringify(payload) }),
  updateLibraryEntry: (id, payload) => request(`/library/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteLibraryEntry: (id) => request(`/library/${id}`, { method: "DELETE" }),
  getMcpKey: () => request("/mcp/key"),
  generateMcpKey: () => request("/mcp/key/generate", { method: "POST", body: JSON.stringify({}) }),
  pushVapidKey: () => request("/push/vapid-key"),
  pushSubscribe: (sub) => request("/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  pushUnsubscribe: (sub) => request("/push/subscribe", { method: "DELETE", body: JSON.stringify(sub) }),
  exportPdf: async (id) => {
    const response = await fetch(`${API}/export/${id}/pdf`, { headers: { "X-User-Id": getUserId(), ...authHeaders() } });
    if (!response.ok) throw new Error("PDF export failed");
    return response.blob();
  },
};

export const identity = { getUserId };
