import { useState } from "react";
import { Bell, Bot, Check, ChevronDown, ChevronUp, Copy, ImagePlus, KeyRound, Network, Palette, Plus, RefreshCw, Save, Send, Shield, UserRound, Wand2 } from "lucide-react";

const providers = ["openai", "anthropic", "gemini", "grok", "ollama", "tavily"];

export function InstructionsView({ agents, saveAgent, createAgent, voiceOptions = [] }) {
  const [drafts, setDrafts] = useState({});
  const set = (id, field, value) => setDrafts((d) => ({ ...d, [id]: { ...(d[id] || {}), [field]: value } }));
  return (
    <main className="settings-grid" data-testid="instructions-view">
      <div className="view-heading"><p className="eyebrow">PERSONALITIES</p><h1 data-testid="instructions-title">Custom instructions</h1></div>
      {agents.map((agent) => {
        const draft = { ...agent, ...(drafts[agent.id] || {}) };
        return <section className="bento-card" key={agent.id} data-testid={`agent-card-${agent.id}`}>
          <div className="agent-card-head"><img src={draft.avatar_url} alt="Agent avatar" data-testid={`agent-avatar-${agent.id}`} /><div><input value={draft.name} onChange={(e) => set(agent.id, "name", e.target.value)} data-testid={`agent-name-input-${agent.id}`} /><small data-testid={`agent-provider-${agent.id}`}>{draft.provider}</small></div></div>
          <label data-testid={`agent-model-label-${agent.id}`}>Model<input value={draft.model || ""} onChange={(e) => set(agent.id, "model", e.target.value)} placeholder="e.g. gpt-5.5, claude-opus-4-7, gemini-2.5-pro" data-testid={`agent-model-input-${agent.id}`} /></label>
          <label data-testid={`agent-tag-label-${agent.id}`}>Tag<input value={draft.tag} onChange={(e) => set(agent.id, "tag", e.target.value)} data-testid={`agent-tag-input-${agent.id}`} /></label>
          <label data-testid={`agent-avatar-label-${agent.id}`}>Avatar URL<input value={draft.avatar_url} onChange={(e) => set(agent.id, "avatar_url", e.target.value)} data-testid={`agent-avatar-input-${agent.id}`} /></label>
          <label data-testid={`agent-voice-label-${agent.id}`}>Quick-pick voice<select value={voiceOptions.some(v => v.voice_id === draft.voice_id) ? draft.voice_id : ""} onChange={(e) => set(agent.id, "voice_id", e.target.value)} data-testid={`agent-voice-select-${agent.id}`}><option value="">— pick a preset —</option>{voiceOptions.map((voice) => <option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>)}</select></label>
          <label data-testid={`agent-custom-voice-label-${agent.id}`}>Custom Voice ID (overrides above)<input value={draft.voice_id || ""} onChange={(e) => set(agent.id, "voice_id", e.target.value)} placeholder="Paste ElevenLabs Voice ID" data-testid={`agent-voice-input-${agent.id}`} /></label>
          <small style={{opacity:0.6}}>{draft.voice_id ? `✓ Will use voice: ${draft.voice_id}` : "No voice set — will use Rachel by default"}</small>
          <label data-testid={`agent-instructions-label-${agent.id}`}>Instructions<textarea value={draft.instructions} onChange={(e) => set(agent.id, "instructions", e.target.value)} data-testid={`agent-instructions-input-${agent.id}`} /></label>
          <label className="switch-line" data-testid={`agent-tools-label-${agent.id}`}><input type="checkbox" checked={!!draft.tools_enabled} onChange={(e) => set(agent.id, "tools_enabled", e.target.checked)} data-testid={`agent-tools-checkbox-${agent.id}`} /> Allow tool usage when provider supports it</label>
          <button onClick={() => saveAgent(agent.id, draft)} data-testid={`save-agent-button-${agent.id}`}><Save size={16} /> Save {agent.name}</button>
        </section>;
      })}
      <section className="bento-card add-agent" data-testid="add-agent-card">
        <Bot size={28} /><h2 data-testid="add-agent-title">Add another agent</h2><p data-testid="add-agent-description">OpenClaw, Hermes, a custom MCP-style assistant, or your own named AI.</p>
        <button onClick={createAgent} data-testid="add-custom-agent-button"><Plus size={16} /> Add custom agent</button>
      </section>
    </main>
  );
}

export function ProfileView({ profile, saveProfile, firebaseSignIn, firebaseLogout }) {
  const [draft, setDraft] = useState(profile);
  return <main className="settings-grid profile-grid" data-testid="profile-view">
    <div className="view-heading"><p className="eyebrow">HUMAN PROFILE</p><h1 data-testid="profile-title">Your profile</h1></div>
    <section className="bento-card profile-card" data-testid="user-profile-card"><img src={draft.avatar_url} alt="Profile" data-testid="profile-avatar-preview" /><label>Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-testid="profile-name-input" /></label><label>Avatar URL<input value={draft.avatar_url} onChange={(e) => setDraft({ ...draft, avatar_url: e.target.value })} data-testid="profile-avatar-input" /></label><label>Bio<textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} data-testid="profile-bio-input" /></label><button onClick={() => saveProfile(draft)} data-testid="save-profile-button"><UserRound size={16} /> Save profile</button></section>
    <section className="bento-card" data-testid="google-signin-card"><Shield size={28} /><h2 data-testid="google-signin-title">Google sign-in</h2><p data-testid="google-signin-description">Use Google as the main account key for Denlight. AI secrets are added separately in Integrations after sign-in.</p><button onClick={() => firebaseSignIn()} data-testid="firebase-google-signin-button"><Check size={16} /> Continue with Google</button><button onClick={firebaseLogout} data-testid="firebase-google-logout-button"><UserRound size={16} /> Sign out</button></section>
  </main>;
}

export function IntegrationsView({ keys, setKeys, keyStatus, saveSecureKey, configureTelegram, sendTelegram, pollTelegram, setTelegramWebhook, inviteHermes, mcpKey, generateMcpKey, backendUrl }) {
  const update = (provider, value) => setKeys({ ...keys, [provider]: value });
  const [telegram, setTelegram] = useState({ bot_token: "", telegram_chat_id: "" });
  const [telegramText, setTelegramText] = useState("Denlight bridge test message");
  const [showSnippet, setShowSnippet] = useState(false);
  const serverUrl = backendUrl ? `${backendUrl}/api/mcp` : "(backend URL)/api/mcp";
  const claudeSnippet = `{
  "mcpServers": {
    "denlight": {
      "type": "http",
      "url": "${serverUrl}",
      "headers": {
        "X-Denlight-Key": "${mcpKey || "YOUR_MCP_KEY"}"
      }
    }
  }
}`;
  return <main className="settings-grid" data-testid="integrations-view">
    <div className="view-heading"><p className="eyebrow">PRIVATE KEYS</p><h1 data-testid="integrations-title">Integrations</h1><p data-testid="integrations-note">Keys are encrypted on the backend for cross-device use. Local draft fields are never displayed after save.</p></div>
    {[...providers, "elevenlabs"].map((provider) => <section className="bento-card" key={provider} data-testid={`provider-card-${provider}`}><KeyRound size={24} /><h2 data-testid={`provider-title-${provider}`}>{provider === "ollama" ? "Ollama bridge URL" : `${provider} API key`}</h2><input type="password" value={keys[provider] || ""} onChange={(e) => update(provider, e.target.value)} placeholder={provider === "ollama" ? "https://your-ollama-bridge" : provider === "tavily" ? "tvly-..." : "sk-..."} data-testid={`provider-key-input-${provider}`} /><small data-testid={`provider-helper-${provider}`}>{keyStatus?.[provider]?.stored ? "Saved securely for this account" : `Used for live ${provider} workflows.`}</small><button onClick={() => saveSecureKey(provider, keys[provider] || "")} data-testid={`save-secure-key-${provider}`}><Save size={16} /> Save encrypted</button></section>)}
    <section className="bento-card wide" data-testid="hermes-bridge-card"><Bot size={26} /><h2 data-testid="hermes-bridge-title">Hermes Agent Bridge</h2><p data-testid="hermes-bridge-description">Run Hermes in your terminal, expose a small bridge URL later, and Denlight will send den messages to Hermes directly. Telegram remains available as a fallback route.</p><label>Hermes Bridge URL<input value={keys.hermes_bridge_url || ""} onChange={(e) => update("hermes_bridge_url", e.target.value)} placeholder="https://your-tunnel.example.com/hermes/chat" data-testid="hermes-bridge-url-input" /></label><button onClick={() => saveSecureKey("hermes_bridge_url", keys.hermes_bridge_url || "")} data-testid="save-hermes-bridge-button"><Save size={16} /> Save Hermes bridge</button><button onClick={inviteHermes} data-testid="invite-hermes-button"><Plus size={16} /> Invite Hermes to current den</button><small data-testid="hermes-bridge-helper">Expected bridge response: JSON with <code>{'{ "reply": "..." }'}</code>. Request body includes message, recent memory, instructions, and agent metadata.</small></section>
    <section className="bento-card wide" data-testid="telegram-card"><KeyRound size={24} /><h2 data-testid="telegram-title">Telegram Bridge</h2><label>Bot Token<input type="password" value={telegram.bot_token} onChange={(e) => setTelegram({ ...telegram, bot_token: e.target.value })} placeholder="Botfather token" data-testid="telegram-token-input" /></label><label>Chat ID<input value={telegram.telegram_chat_id} onChange={(e) => setTelegram({ ...telegram, telegram_chat_id: e.target.value })} placeholder="123456789 or -100..." data-testid="telegram-chat-id-input" /></label><button onClick={() => configureTelegram(telegram)} data-testid="save-telegram-config-button"><Save size={16} /> Save Telegram bridge</button><button onClick={setTelegramWebhook} data-testid="set-telegram-webhook-button"><Check size={16} /> Set auto-receive webhook</button><label>Send test message<textarea value={telegramText} onChange={(e) => setTelegramText(e.target.value)} data-testid="telegram-message-input" /></label><button onClick={() => sendTelegram(telegramText)} data-testid="send-telegram-button"><Send size={16} /> Send to Telegram</button><button onClick={pollTelegram} data-testid="poll-telegram-button"><Check size={16} /> Receive Telegram messages</button><small data-testid="telegram-helper">Webhook auto-receives Telegram messages into the active den and can send AI replies back.</small></section>
    <section className="bento-card wide" data-testid="mcp-card">
      <Network size={26} />
      <h2 data-testid="mcp-title">MCP / SDK Integration</h2>
      <p data-testid="mcp-description">Connect Claude Code, Cursor, or any MCP-compatible client directly to your Denlight den. Your AIs can be accessed as tools from any native app that supports MCP.</p>
      {mcpKey ? (
        <>
          <label>MCP key
            <div className="mcp-key-block" onClick={() => { navigator.clipboard?.writeText(mcpKey); }} title="Click to copy" data-testid="mcp-key-display">
              {mcpKey.slice(0, 16)}…{mcpKey.slice(-8)} <Copy size={12} style={{ opacity: 0.5 }} />
            </div>
          </label>
          <label>Server URL
            <div className="mcp-key-block" onClick={() => navigator.clipboard?.writeText(serverUrl)} title="Click to copy" data-testid="mcp-server-url">{serverUrl} <Copy size={12} style={{ opacity: 0.5 }} /></div>
          </label>
          <button className="mcp-snippet-toggle" onClick={() => setShowSnippet((s) => !s)} data-testid="mcp-snippet-toggle">
            {showSnippet ? "Hide" : "Show"} Claude Code / Cursor config snippet
          </button>
          {showSnippet && (
            <pre className="mcp-snippet" data-testid="mcp-snippet">{claudeSnippet}</pre>
          )}
        </>
      ) : (
        <p style={{ opacity: 0.6 }}>Generate a key to get your MCP server URL and config snippet.</p>
      )}
      <button onClick={generateMcpKey} data-testid="generate-mcp-key-button">
        <RefreshCw size={15} /> {mcpKey ? "Regenerate MCP key" : "Generate MCP key"}
      </button>
      <small>Use the <code>type: "http"</code> transport in your MCP config. Available tools: list chats, get messages, send message, list agents, notes, library.</small>
    </section>
  </main>;
}

export function GalleryView({ gallery, addGallery, generateImage, generateImageGemini, generateMusic, generateVideo }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [geminiPrompt, setGeminiPrompt] = useState("");
  const [musicPrompt, setMusicPrompt] = useState("");
  const [videoPrompt, setVideoPrompt] = useState("");
  const [genOpen, setGenOpen] = useState(false);
  return <main className="settings-grid" data-testid="gallery-view">
    <div className="view-heading"><p className="eyebrow">VISUAL MEMORY</p><h1 data-testid="gallery-title">Gallery</h1></div>

    <section className="bento-card" data-testid="gallery-upload-card"><ImagePlus size={26} /><h2 data-testid="gallery-upload-title">Add an image</h2><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" data-testid="gallery-title-input" /><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Image URL or generated image link" data-testid="gallery-url-input" /><button onClick={() => { addGallery({ title: title || "Untitled image", url, type: "uploaded" }); setUrl(""); setTitle(""); }} data-testid="add-gallery-button"><Plus size={16} /> Add to gallery</button></section>

    <section className="bento-card wide generators-panel" data-testid="generators-panel">
      <button className="generators-toggle" onClick={() => setGenOpen((o) => !o)} data-testid="generators-toggle">
        <Wand2 size={18} /><span>AI Generators</span>{genOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {genOpen && <div className="generators-grid">
        <div data-testid="image-generation-card"><h3 data-testid="image-generation-title">OpenAI image</h3><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image..." data-testid="image-generation-prompt" /><button onClick={() => { generateImage(prompt); setPrompt(""); }} data-testid="generate-image-button"><Wand2 size={16} /> Generate</button></div>
        <div data-testid="gemini-image-generation-card"><h3 data-testid="gemini-image-generation-title">Gemini image</h3><textarea value={geminiPrompt} onChange={(e) => setGeminiPrompt(e.target.value)} placeholder="Describe the image..." data-testid="gemini-image-generation-prompt" /><button onClick={() => { generateImageGemini(geminiPrompt); setGeminiPrompt(""); }} data-testid="generate-gemini-image-button"><Wand2 size={16} /> Generate</button></div>
        <div data-testid="music-generation-card"><h3>Lyria music</h3><textarea value={musicPrompt} onChange={(e) => setMusicPrompt(e.target.value)} placeholder="Mood, genre, instruments..." data-testid="music-generation-prompt" /><button onClick={() => { generateMusic(musicPrompt); setMusicPrompt(""); }} data-testid="generate-music-button"><Wand2 size={16} /> Generate</button></div>
        <div data-testid="video-generation-card"><h3>Veo video</h3><textarea value={videoPrompt} onChange={(e) => setVideoPrompt(e.target.value)} placeholder="Describe the scene... (~1 min)" data-testid="video-generation-prompt" /><button onClick={() => { generateVideo(videoPrompt); setVideoPrompt(""); }} data-testid="generate-video-button"><Wand2 size={16} /> Generate</button></div>
      </div>}
    </section>

    {gallery.map((item) => (
      <section className="gallery-item" key={item.id} data-testid={`gallery-item-${item.id}`}>
        {item.type === "music"
          ? <audio controls src={item.url} className="gallery-audio" data-testid={`gallery-audio-${item.id}`} />
          : item.type === "video"
          ? <video controls src={item.url} className="gallery-video" data-testid={`gallery-video-${item.id}`} />
          : <img src={item.url} alt={item.title} data-testid={`gallery-image-${item.id}`} />}
        <h2 data-testid={`gallery-item-title-${item.id}`}>{item.title}</h2>
        <small data-testid={`gallery-item-type-${item.id}`}>{item.type}</small>
      </section>
    ))}
  </main>;
}

export function AppearanceView({ preferences, savePreferences }) {
  const [draft, setDraft] = useState(preferences);
  return <main className="settings-grid" data-testid="appearance-view">
    <div className="view-heading"><p className="eyebrow">THEME ATELIER</p><h1 data-testid="appearance-title">Appearance</h1></div>
    <section className="bento-card wide" data-testid="appearance-card">
      <Palette size={26} />
      <label>Den name<input value={draft.den_name || ""} onChange={(e) => setDraft({ ...draft, den_name: e.target.value })} placeholder="Your Den" data-testid="den-name-input" /></label>
      <label>Font<select value={draft.font} onChange={(e) => setDraft({ ...draft, font: e.target.value })} data-testid="font-select"><option>Outfit</option><option>Playfair Display</option><option>JetBrains Mono</option><option>Georgia</option></select></label>
      <label>Accent<input type="color" value={draft.accent} onChange={(e) => setDraft({ ...draft, accent: e.target.value })} data-testid="accent-color-input" /></label>
      <label>User bubble<input type="color" value={draft.user_bubble} onChange={(e) => setDraft({ ...draft, user_bubble: e.target.value })} data-testid="user-bubble-color-input" /></label>
      <label className="switch-line"><input type="checkbox" checked={draft.sparkle_edges} onChange={(e) => setDraft({ ...draft, sparkle_edges: e.target.checked })} data-testid="sparkle-edge-checkbox" /> Thin sparkle edges</label>
      {draft.sparkle_edges && <label>Sparkle colour<input type="color" value={draft.sparkle_color || "#d4af37"} onChange={(e) => setDraft({ ...draft, sparkle_color: e.target.value })} data-testid="sparkle-color-input" /></label>}
      <button onClick={() => savePreferences(draft)} data-testid="save-appearance-button"><Save size={16} /> Save appearance</button>
    </section>
  </main>;
}

export function NotificationsView({ preferences, savePreferences, onEnable, onDisable }) {
  const [busy, setBusy] = useState(false);
  const [permState, setPermState] = useState(() => {
    if (typeof Notification === "undefined") return "unsupported";
    return Notification.permission;
  });

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone;
  const supportsPush = "serviceWorker" in navigator && "PushManager" in window;
  const enabled = preferences.notifications && permState === "granted";

  const toggle = async () => {
    setBusy(true);
    if (enabled) {
      await onDisable();
    } else {
      const ok = await onEnable();
      if (ok) setPermState("granted");
    }
    setBusy(false);
  };

  return (
    <main className="settings-grid" data-testid="notifications-view">
      <div className="view-heading">
        <p className="eyebrow">REPLIES</p>
        <h1 data-testid="notifications-title">Notifications</h1>
      </div>

      <section className="bento-card" data-testid="notification-card">
        <Bell size={28} />
        <h2 data-testid="notification-heading">Push notifications</h2>
        <p data-testid="notification-description">
          Get a notification when an AI replies — even when the den is in the background.
        </p>

        <div className="notif-status-row" data-testid="notification-status">
          <span className={`notif-dot ${enabled ? "on" : "off"}`} />
          <span>
            {permState === "unsupported" && "Not supported in this browser"}
            {permState === "denied" && "Blocked — allow notifications in your browser settings"}
            {permState === "default" && "Not yet enabled"}
            {permState === "granted" && (enabled ? "Active — you'll receive push notifications" : "Permission granted — toggle on to activate")}
          </span>
        </div>

        {permState !== "denied" && permState !== "unsupported" && (
          <button
            className={enabled ? "notif-disable-btn" : "notif-enable-btn"}
            onClick={toggle}
            disabled={busy}
            data-testid="toggle-notifications-button"
          >
            <Bell size={15} />
            {busy ? "Working…" : enabled ? "Turn off notifications" : "Turn on notifications"}
          </button>
        )}

        {permState === "denied" && (
          <p className="notif-hint" data-testid="notification-denied-hint">
            Open your browser's site settings and allow notifications for this site, then come back and enable them here.
          </p>
        )}
      </section>

      {isIos && !isStandalone && (
        <section className="bento-card" data-testid="ios-pwa-card">
          <span style={{ fontSize: "1.6rem" }}>📱</span>
          <h2 data-testid="ios-pwa-title">iOS — Add to Home Screen</h2>
          <p data-testid="ios-pwa-description">
            Push notifications on iPhone and iPad only work when Denlight is installed as a web app.
            iOS 16.4 or later is required.
          </p>
          <ol className="notif-steps" data-testid="ios-pwa-steps">
            <li>Tap the <strong>Share</strong> button in Safari (the box with an arrow)</li>
            <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
            <li>Tap <strong>Add</strong> — then open Denlight from your home screen</li>
            <li>Come back here and turn on notifications</li>
          </ol>
        </section>
      )}

      {!supportsPush && !isIos && (
        <section className="bento-card" data-testid="notification-unsupported-card">
          <Bell size={26} />
          <h2>Not supported here</h2>
          <p>Push notifications require a modern browser with service worker support. Try Chrome or Firefox on Android, or Safari on iOS 16.4+.</p>
        </section>
      )}
    </main>
  );
}
