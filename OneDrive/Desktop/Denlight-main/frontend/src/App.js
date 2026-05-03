import { useEffect, useState } from "react";
import "@/App.css";
import { Toaster, toast } from "sonner";
import { api } from "./lib/api";
import { loadFirebaseConfig, signInWithGoogleConfig, logoutGoogle } from "./lib/firebaseAuth";
import AppShell from "./components/AppShell";
import Sidebar from "./components/Sidebar";
import ChatView from "./components/ChatView";
import HomeView from "./components/HomeView";
import NotesView from "./components/NotesView";
import GuideView from "./components/GuideView";
import LibraryView from "./components/LibraryView";
import MusicView from "./components/MusicView";
import HatchPet from "./components/HatchPet";
import { AppearanceView, GalleryView, InstructionsView, IntegrationsView, NotificationsView, ProfileView } from "./components/SettingsViews";

const keyStorage = "denlight-provider-keys";

function base64urlToUint8Array(base64url) {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function AuthGate({ onSignedIn }) {
  const [config] = useState(() => loadFirebaseConfig());
  const [busy, setBusy] = useState(false);
  const signIn = async () => {
    setBusy(true);
    try {
      const { token } = await signInWithGoogleConfig(config);
      const session = await api.firebaseLogin({ id_token: token, project_id: config.projectId });
      localStorage.setItem("denlight-user-id", session.user_id);
      await onSignedIn();
      toast.success(`Signed in as ${session.profile.name}`);
    } catch (error) {
      localStorage.removeItem("denlight-firebase-token");
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-gate" data-testid="auth-gate">
      <section className="auth-panel" data-testid="auth-panel">
        <p className="eyebrow" data-testid="auth-eyebrow">PRIVATE DEN</p>
        <h1 data-testid="auth-title">Sign in to open Denlight</h1>
        <p data-testid="auth-description">Continue with Google to unlock your chats, AI keys, gallery, Telegram bridge, and voice tools.</p>
        {!config && <p className="auth-warning" data-testid="auth-config-warning">Google sign-in needs Firebase environment settings before it can open.</p>}
        <button onClick={signIn} disabled={busy || !config} data-testid="auth-google-signin-button">{busy ? "Opening Google..." : "Continue with Google"}</button>
      </section>
      <Toaster richColors position="top-right" />
    </div>
  );
}

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function App() {
  const [workspace, setWorkspace] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [view, setView] = useState("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [providerKeys, setProviderKeys] = useState(() => JSON.parse(localStorage.getItem(keyStorage) || "{}"));
  const [keyStatus, setKeyStatus] = useState({});
  const [signedIn, setSignedIn] = useState(() => !!localStorage.getItem("denlight-firebase-token"));
  const [voiceOptions, setVoiceOptions] = useState([
    { voice_id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel" },
    { voice_id: "pNInz6obpgDQGcFmaJgB", name: "Adam" },
    { voice_id: "EXAVITQu4vr4xnSDxMaL", name: "Bella" },
  ]);
  const [mcpKey, setMcpKey] = useState(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const load = async () => {
    try {
      const data = await api.workspace();
      setWorkspace(data);
      setActiveChat(data.active_chat);
      const status = await api.keyStatus();
      setKeyStatus(status.services || {});
    } catch (error) {
      toast.error(error.message);
      if (error.message.includes("sign-in") || error.message.includes("Firebase")) {
        localStorage.removeItem("denlight-firebase-token");
        setSignedIn(false);
      }
    }
  };

  useEffect(() => {
    if (signedIn) load();
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    api.getMcpKey().then((r) => setMcpKey(r.key)).catch(() => {});
  }, [signedIn]);

  useEffect(() => {
    localStorage.setItem(keyStorage, JSON.stringify(providerKeys));
  }, [providerKeys]);

  if (!signedIn) {
    return <AuthGate onSignedIn={async () => { setSignedIn(true); await load(); }} />;
  }

  if (!workspace) {
    return <div className="loading-screen" data-testid="loading-screen"><span></span> Opening the den...</div>;
  }

  const updateWorkspace = (patch) => setWorkspace((current) => ({ ...current, ...patch }));
  const savePreferences = async (payload) => {
    const preferences = await api.preferences(payload);
    updateWorkspace({ preferences });
    toast.success("Appearance saved");
  };
  const saveProfile = async (payload) => {
    const profile = await api.profile(payload);
    updateWorkspace({ profile });
    toast.success("Profile saved");
  };
  const saveAgent = async (id, payload) => {
    const updated = await api.updateAgent(id, payload);
    updateWorkspace({ agents: workspace.agents.map((agent) => agent.id === id ? updated : agent) });
    toast.success(`${updated.name} updated`);
  };
  const createAgent = async () => {
    const agent = await api.createAgent({ name: "New Agent", provider: "openai", model: "gpt-5.2", tag: "custom", instructions: "Be helpful and distinct from the other AIs." });
    updateWorkspace({ agents: [...workspace.agents, agent] });
    toast.success("Custom agent added");
  };
  const firebaseSignIn = async (config) => {
    try {
      const firebaseConfig = config || loadFirebaseConfig();
      const { token } = await signInWithGoogleConfig(firebaseConfig);
      const session = await api.firebaseLogin({ id_token: token, project_id: firebaseConfig.projectId });
      localStorage.setItem("denlight-user-id", session.user_id);
      setSignedIn(true);
      await load();
      toast.success(`Signed in as ${session.profile.name}`);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const firebaseLogout = async () => {
    await logoutGoogle();
    localStorage.removeItem("denlight-user-id");
    setWorkspace(null);
    setActiveChat(null);
    setSignedIn(false);
    toast.success("Signed out");
  };
  const saveSecureKey = async (service, secret) => {
    try {
      await api.saveKey({ service, secret });
      const status = await api.keyStatus();
      setKeyStatus(status.services || {});
      if (service === "elevenlabs") {
        try {
          const result = await api.voices();
          setVoiceOptions(result.voices || voiceOptions);
        } catch (error) {
          toast.error(error.message);
        }
      }
      toast.success(`${service} saved securely`);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const inviteHermes = async () => {
    try {
      const chat = await api.inviteHermes(activeChat.id);
      setActiveChat(chat);
      toast.success("Hermes joined this den");
    } catch (error) {
      toast.error(error.message);
    }
  };
  const createChat = async (agentIds) => {
    const ids = agentIds || workspace.agents.filter((a) => a.enabled).slice(0, 3).map((a) => a.id);
    const chat = await api.createChat({ title: "New Den", mode: ids.length === 1 ? "solo" : "group", agent_ids: ids });
    const full = await api.getChat(chat.id);
    updateWorkspace({ chats: [chat, ...workspace.chats] });
    setActiveChat(full);
    setView("chat");
  };
  const openChat = async (id) => setActiveChat(await api.getChat(id));
  const renameChat = async (id, title) => {
    if (!title.trim()) return;
    try {
      await api.renameChat(id, title);
      updateWorkspace({ chats: workspace.chats.map((c) => c.id === id ? { ...c, title } : c) });
      if (activeChat?.id === id) setActiveChat((c) => ({ ...c, title }));
    } catch (error) {
      toast.error(error.message);
    }
  };
  const deleteChat = async (id) => {
    try {
      await api.deleteChat(id);
      updateWorkspace({ chats: workspace.chats.filter((c) => c.id !== id) });
      if (activeChat?.id === id) setActiveChat(null);
    } catch (error) {
      toast.error(error.message);
    }
  };
  const sendMessage = async (payload) => {
    setLoading(true);
    const optimistic = { id: `pending-${Date.now()}`, role: "user", sender_name: workspace.profile.name, sender_id: "human", avatar_url: workspace.profile.avatar_url, content: payload.content, formatting: payload.formatting, created_at: new Date().toISOString() };
    setActiveChat((c) => ({ ...c, messages: [...(c.messages || []), optimistic] }));
    try {
      const result = await api.sendMessage(activeChat.id, { ...payload, provider_keys: providerKeys });
      setActiveChat((c) => ({ ...c, messages: result.messages }));
      if (workspace.preferences.notifications && document.hidden && result.ai_messages?.length && "Notification" in window) {
        const last = result.ai_messages[result.ai_messages.length - 1];
        new window.Notification(`${last.sender_name} replied`, { body: last.content.slice(0, 120) });
      }
      toast.success("The den replied");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };
  const resetChat = async () => {
    await api.resetChat(activeChat.id);
    setActiveChat({ ...activeChat, messages: [] });
    toast.success("Chat reset");
  };
  const exportChat = async () => {
    const file = await api.exportChat(activeChat.id);
    downloadFile(file.filename, file.content);
    toast.success("Markdown export created");
  };
  const exportPdf = async () => {
    const blob = await api.exportPdf(activeChat.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeChat.title.replaceAll(" ", "-").toLowerCase()}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("PDF export created");
  };
  const addGallery = async (payload) => {
    if (!payload.url) return toast.error("Add an image URL first");
    const item = await api.gallery(payload);
    updateWorkspace({ gallery: [item, ...workspace.gallery] });
    toast.success("Image added to gallery");
  };
  const generateImage = async (prompt) => {
    try {
      const result = await api.generateImage({ prompt });
      updateWorkspace({ gallery: [result.gallery_item, ...workspace.gallery] });
      toast.success("Image generated into gallery");
    } catch (error) {
      toast.error(error.message);
    }
  };
  const generateImageGemini = async (prompt) => {
    try {
      const result = await api.generateImageGemini({ prompt });
      updateWorkspace({ gallery: [result.gallery_item, ...workspace.gallery] });
      toast.success("Gemini image generated into gallery");
    } catch (error) {
      toast.error(error.message);
    }
  };
  const generateMusic = async (prompt) => {
    try {
      const result = await api.generateMusic({ prompt });
      updateWorkspace({ gallery: [result.gallery_item, ...workspace.gallery] });
      toast.success("Music generated into gallery");
    } catch (error) {
      toast.error(error.message);
    }
  };
  const generateVideo = async (prompt) => {
    try {
      toast.success("Veo is generating your video — this takes a minute...");
      const result = await api.generateVideo({ prompt });
      updateWorkspace({ gallery: [result.gallery_item, ...workspace.gallery] });
      toast.success("Video generated into gallery");
    } catch (error) {
      toast.error(error.message);
    }
  };
  const transcribeAudio = async (file) => {
    try {
      const result = await api.transcribe(file);
      toast.success("Voice note transcribed");
      return result.transcript;
    } catch (error) {
      toast.error(error.message);
      return "";
    }
  };
  const speakText = async (text, voiceId) => {
    try {
      const result = await api.speak({ text, voice_id: voiceId || "21m00Tcm4TlvDq8ikWAM" });
      const audio = new Audio(result.audio_url);
      await audio.play();
    } catch (error) {
      toast.error(error.message);
    }
  };
  const configureTelegram = async (payload) => {
    try {
      await api.telegramConfig(payload);
      const status = await api.keyStatus();
      setKeyStatus(status.services || {});
      toast.success("Telegram bridge saved");
    } catch (error) {
      toast.error(error.message);
    }
  };
  const sendTelegram = async (text) => {
    try {
      await api.telegramSend({ text });
      toast.success("Sent to Telegram");
    } catch (error) {
      toast.error(error.message);
    }
  };
  const pollTelegram = async () => {
    const result = await api.telegramPoll({ den_chat_id: activeChat.id });
    setActiveChat({ ...activeChat, messages: result.messages });
    toast.success(`${result.imported.length} Telegram message(s) imported`);
  };
  const setTelegramWebhook = async () => {
    try {
      const result = await api.telegramSetWebhook({ den_chat_id: activeChat.id, webhook_base_url: window.location.origin });
      toast.success("Telegram webhook connected");
      return result.webhook_url;
    } catch (error) {
      toast.error(error.message);
      return "";
    }
  };

  const openChatAndNavigate = async (id) => { await openChat(id); setView("chat"); };

  const addNote = async () => {
    try {
      const note = await api.createNote({ title: "", content: "", color: "#fef08a", author: workspace.profile.name });
      updateWorkspace({ notes: [note, ...(workspace.notes || [])] });
    } catch (error) { toast.error(error.message); }
  };
  const updateNote = async (id, patch) => {
    try {
      const updated = await api.updateNote(id, patch);
      updateWorkspace({ notes: (workspace.notes || []).map((n) => n.id === id ? updated : n) });
    } catch (error) { toast.error(error.message); }
  };
  const deleteNote = async (id) => {
    try {
      await api.deleteNote(id);
      updateWorkspace({ notes: (workspace.notes || []).filter((n) => n.id !== id) });
    } catch (error) { toast.error(error.message); }
  };

  const addLibraryEntry = async (payload) => {
    try {
      const entry = await api.createLibraryEntry(payload);
      updateWorkspace({ library: [entry, ...(workspace.library || [])] });
      return entry;
    } catch (error) { toast.error(error.message); return null; }
  };
  const updateLibraryEntry = async (id, patch) => {
    try {
      const updated = await api.updateLibraryEntry(id, patch);
      updateWorkspace({ library: (workspace.library || []).map((e) => e.id === id ? updated : e) });
    } catch (error) { toast.error(error.message); }
  };
  const deleteLibraryEntry = async (id) => {
    try {
      await api.deleteLibraryEntry(id);
      updateWorkspace({ library: (workspace.library || []).filter((e) => e.id !== id) });
    } catch (error) { toast.error(error.message); }
  };

  const updateNowPlaying = async (title) => {
    try {
      const updated = await api.preferences({ ...workspace.preferences, now_playing: title });
      updateWorkspace({ preferences: updated });
    } catch (_) {}
  };

  const updatePetPrefs = async (petDraft) => {
    try {
      const updated = await api.preferences({
        pet_id: petDraft.pet_id ?? workspace.preferences.pet_id,
        pet_name: petDraft.pet_name ?? workspace.preferences.pet_name,
        pet_emoji: petDraft.pet_emoji ?? workspace.preferences.pet_emoji,
        pet_desc: petDraft.pet_desc ?? workspace.preferences.pet_desc,
        pet_enabled: petDraft.pet_enabled !== undefined ? petDraft.pet_enabled : workspace.preferences.pet_enabled,
      });
      updateWorkspace({ preferences: { ...workspace.preferences, ...updated } });
      toast.success("Companion saved");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const createMcpKey = async () => {
    try {
      const result = await api.generateMcpKey();
      setMcpKey(result.key);
      toast.success("MCP key generated");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const enablePushNotifications = async () => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        toast.error("Push notifications are not supported in this browser");
        return false;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notification permission denied");
        return false;
      }
      const reg = await navigator.serviceWorker.ready;
      const { public_key } = await api.pushVapidKey();
      const raw = base64urlToUint8Array(public_key);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
      const json = sub.toJSON();
      await api.pushSubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
      await savePreferences({ ...workspace.preferences, notifications: true });
      toast.success("Push notifications enabled");
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    }
  };

  const disablePushNotifications = async () => {
    try {
      const reg = await navigator.serviceWorker?.ready;
      const sub = await reg?.pushManager?.getSubscription();
      if (sub) {
        const json = sub.toJSON();
        await api.pushUnsubscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
        await sub.unsubscribe();
      }
      await savePreferences({ ...workspace.preferences, notifications: false });
      toast.success("Notifications disabled");
    } catch (error) {
      toast.error(error.message);
    }
  };

  const renderView = () => {
    if (view === "home") return <HomeView profile={workspace.profile} agents={workspace.agents} preferences={workspace.preferences} chats={workspace.chats} onOpenChat={openChatAndNavigate} onCreateChat={createChat} savePreferences={savePreferences} />;
    if (view === "notes") return <NotesView notes={workspace.notes || []} onAdd={addNote} onUpdate={updateNote} onDelete={deleteNote} />;
    if (view === "library") return <LibraryView agents={workspace.agents} library={workspace.library || []} onAdd={addLibraryEntry} onUpdate={updateLibraryEntry} onDelete={deleteLibraryEntry} />;
    if (view === "music") return <MusicView preferences={workspace.preferences} onNowPlaying={updateNowPlaying} />;
    if (view === "guide") return <GuideView agents={workspace.agents} profile={workspace.profile} keyStatus={keyStatus} preferences={workspace.preferences} />;
    if (view === "instructions") return <InstructionsView agents={workspace.agents} saveAgent={saveAgent} createAgent={createAgent} voiceOptions={voiceOptions} />;
    if (view === "profile") return <ProfileView profile={workspace.profile} saveProfile={saveProfile} firebaseSignIn={firebaseSignIn} firebaseLogout={firebaseLogout} />;
    if (view === "integrations") return <IntegrationsView keys={providerKeys} setKeys={setProviderKeys} keyStatus={keyStatus} saveSecureKey={saveSecureKey} configureTelegram={configureTelegram} sendTelegram={sendTelegram} pollTelegram={pollTelegram} setTelegramWebhook={setTelegramWebhook} inviteHermes={inviteHermes} mcpKey={mcpKey} generateMcpKey={createMcpKey} backendUrl={process.env.REACT_APP_BACKEND_URL} />;
    if (view === "gallery") return <GalleryView gallery={workspace.gallery} addGallery={addGallery} generateImage={generateImage} generateImageGemini={generateImageGemini} generateMusic={generateMusic} generateVideo={generateVideo} />;
    if (view === "appearance") return <AppearanceView preferences={workspace.preferences} savePreferences={savePreferences} />;
    if (view === "notifications") return <NotificationsView preferences={workspace.preferences} savePreferences={savePreferences} onEnable={enablePushNotifications} onDisable={disablePushNotifications} />;
    return <ChatView chat={activeChat} agents={workspace.agents} profile={workspace.profile} loading={loading} onSend={sendMessage} onReset={resetChat} onExport={exportChat} onExportPdf={exportPdf} onTranscribe={transcribeAudio} onSpeak={speakText} />;
  };

  return (
    <div className={`${workspace.preferences.theme === "dark" ? "dark" : ""} ${workspace.preferences.sparkle_edges ? "sparkle-edges" : ""}`} style={{ "--accent": workspace.preferences.accent, "--userBubble": workspace.preferences.user_bubble, "--sparkle": workspace.preferences.sparkle_color || workspace.preferences.accent || "#d4af37", fontFamily: workspace.preferences.font }} data-testid="denlight-root">
      <AppShell profile={workspace.profile} preferences={workspace.preferences} onMenu={() => setMenuOpen(true)} onTheme={() => savePreferences({ ...workspace.preferences, theme: workspace.preferences.theme === "dark" ? "light" : "dark" })}>
        <div className={`workspace-layout ${sidebarCollapsed ? "sidebar-collapsed" : ""}`} data-testid="workspace-layout">
          <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} view={view} setView={setView} chats={workspace.chats} activeChatId={activeChat?.id} openChat={openChat} createChat={createChat} renameChat={renameChat} deleteChat={deleteChat} agents={workspace.agents} collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed((c) => !c)} denName={workspace.preferences.den_name || "Your Den"} />
          <div className="content-area" data-testid="content-area" data-current-view={view}>{renderView()}</div>
        </div>
      </AppShell>
      <HatchPet
        preferences={workspace.preferences}
        updatePetPrefs={updatePetPrefs}
        lastAiMessageId={activeChat?.messages?.filter((m) => m.role === "ai").slice(-1)[0]?.id}
      />
      <Toaster richColors position="top-right" />
    </div>
  );
}

export default App;
