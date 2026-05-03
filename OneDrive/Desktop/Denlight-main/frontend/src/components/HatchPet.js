import { useEffect, useRef, useState } from "react";
import { Settings, X } from "lucide-react";

const PETS = [
  {
    id: "susan",
    name: "Susan", anim: "petFloat",
    spriteUrl: "/pets/susan-sprite.png", frameCount: 6, frameW: 199, frameH: 308, displayH: 80,
    desc: "Grumpy, dignified, cape-wearing. Has opinions about everything and isn't afraid to share them.",
    idle: ["*judging you silently*", "That cape isn't going to wear itself.", "I've seen better.", "Hmph."],
    boop: ["How dare you.", "...fine.", "*ruffles feathers indignantly*", "I did NOT consent to that."],
    chat: ["I suppose that's acceptable.", "Don't get used to me agreeing.", "Hmm. Interesting.", "Could be worse."],
  },
  {
    id: "glint",
    name: "Glint", anim: "petBreathe",
    spriteUrl: "/pets/glint-sprite.png", frameCount: 6, frameW: 247, frameH: 218, displayH: 80,
    desc: "Sparkly and magical. Always waving a little wand and delighting in everything.",
    idle: ["✨ ...twinkle...", "Did you see that shimmer?", "I'm made of starlight~", "Sparkle sparkle~"],
    boop: ["Ooh! Sparkles everywhere!", "You touched a star~", "Hehe! Hi!!", "⭐ !!!!"],
    chat: ["So bright! 🌟", "Magic is happening!", "I feel the glow~", "Ooh ooh ooh!"],
  },
  {
    id: "moon", emoji: "🌙", name: "Moon", anim: "petFloat",
    desc: "Dreamy and ethereal. Speaks in quiet mysteries.",
    idle: ["...I was just dreaming.", "The stars look different tonight.", "I wonder what lies beyond thought."],
    boop: ["Oh! You touched me...", "Careful, I'm fragile tonight.", "That tickles my crescent."],
    chat: ["Interesting... the words shift.", "I feel something new in the air.", "Words have weight."],
  },
  {
    id: "ember", emoji: "🔥", name: "Ember", anim: "petFlicker",
    desc: "Passionate and energetic. Always excited.",
    idle: ["I'M SO EXCITED!", "What are we doing next?!", "The den is warm and I love it!"],
    boop: ["AH! You got me!", "HEYYY!", "That's so fun!!!"],
    chat: ["OHH INTERESTING!!!", "YES YES KEEP GOING!", "I LOVE THIS CONVERSATION!"],
  },
  {
    id: "pebble", emoji: "🪨", name: "Pebble", anim: "petBounce",
    desc: "Calm and grounded. Wise beyond their small size.",
    idle: ["...", "I am here.", "Steady as always."],
    boop: ["Ah.", "Noted.", "I felt that."],
    chat: ["Wise words.", "I see.", "That tracks."],
  },
  {
    id: "wisp", emoji: "✨", name: "Wisp", anim: "petBreathe",
    desc: "Curious and playful. Delights in small things.",
    idle: ["Ooh, what's that?", "I found a sparkle!", "This moment is lovely~"],
    boop: ["Tee hee!", "You found me!", "Ooh, hello!"],
    chat: ["So sparkly!", "Ohh I like this one~", "Everything is interesting!"],
  },
  {
    id: "dewdrop", emoji: "💧", name: "Dewdrop", anim: "petDrift",
    desc: "Gentle and empathetic. Feels everything deeply.",
    idle: ["Are you okay?", "I'm here if you need me.", "The world is so full of feeling..."],
    boop: ["Oh! Hi...", "You're so warm.", "I'm glad you're here."],
    chat: ["That must mean a lot.", "I feel this conversation.", "So much depth here..."],
  },
  {
    id: "thorn", emoji: "🌿", name: "Thorn", anim: "petSway",
    desc: "Cheeky and sarcastic, but genuinely caring.",
    idle: ["Oh, still here? Good.", "Don't mind me.", "Just sitting here being fabulous."],
    boop: ["Watch it.", "Did you just— okay fine.", "Rude. But I liked it."],
    chat: ["Interesting choice of words.", "I could say something, but I won't.", "Sure, sure."],
  },
  {
    id: "glitch", emoji: "👾", name: "Glitch", anim: "petJitter",
    desc: "Quirky and tech-savvy. Speaks in glitched phrases.",
    idle: ["sy5tem.nominal", "ERROR: too_cute", "run: be_here.exe"],
    boop: ["INPUT DETECTED// hi", "touch event registered <3", "BOOP.exe succeeded"],
    chat: ["LOG: conversation.update", "PARSING... interesting", "OUTPUT: wow"],
  },
  {
    id: "shadow", emoji: "🖤", name: "Shadow", anim: "petPulse",
    desc: "Mysterious and intense. Thinks in deep thoughts.",
    idle: ["Darkness is light taking a break.", "I observe.", "Every word leaves a mark."],
    boop: ["You reached into the dark.", "I allowed that.", "Bold move."],
    chat: ["The weight of words.", "Meaning hides in spaces.", "I'm thinking about this."],
  },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function SpriteFrame({ pet, size = pet.displayH }) {
  const w = Math.round(size * pet.frameW / pet.frameH);
  const sheetW = w * pet.frameCount;
  const duration = (pet.frameCount * 0.16).toFixed(2);
  return (
    <div
      className="hatch-pet-sprite"
      style={{
        width: w,
        height: size,
        backgroundImage: `url(${pet.spriteUrl})`,
        backgroundSize: `${sheetW}px ${size}px`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "0 0",
        "--sprite-end": `-${sheetW}px`,
        animation: `spriteCycle ${duration}s steps(${pet.frameCount}) infinite`,
      }}
    />
  );
}

export default function HatchPet({ preferences = {}, updatePetPrefs, lastAiMessageId }) {
  const enabled = preferences.pet_enabled !== false;
  const petId = preferences.pet_id || "wisp";
  const petName = preferences.pet_name || "";
  const petCustomEmoji = preferences.pet_emoji || "";
  const petDesc = preferences.pet_desc || "";

  const base = PETS.find((p) => p.id === petId) || PETS[3];
  const displayEmoji = petCustomEmoji || base.emoji;
  const displayName = petName || base.name;

  const [bubble, setBubble] = useState(null);
  const [booping, setBooping] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const bubbleTimer = useRef(null);
  const lastMsgRef = useRef(null);

  const showBubble = (text, ms = 4000) => {
    clearTimeout(bubbleTimer.current);
    setBubble(text);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  };

  useEffect(() => {
    if (!lastAiMessageId || lastAiMessageId === lastMsgRef.current) return;
    lastMsgRef.current = lastAiMessageId;
    showBubble(pick(base.chat));
  }, [lastAiMessageId, base]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => showBubble(pick(base.idle), 5000), 28000 + Math.random() * 20000);
    return () => clearInterval(id);
  }, [enabled, base]);

  const boop = () => {
    if (booping) return;
    setBooping(true);
    showBubble(pick(base.boop), 3000);
    setTimeout(() => setBooping(false), 600);
  };

  const openSettings = () => {
    setDraft({ ...preferences });
    setSettingsOpen(true);
  };

  if (!enabled) return null;

  return (
    <>
      <div className="hatch-pet-wrapper" data-testid="hatch-pet">
        {bubble && (
          <div className="hatch-pet-bubble" data-testid="hatch-pet-bubble">{bubble}</div>
        )}
        <button
          className={`hatch-pet-btn ${base.anim} ${booping ? "booping" : ""}`}
          onClick={boop}
          title={`${displayName} — click to boop`}
          data-testid="hatch-pet-button"
        >
          {base.spriteUrl ? <SpriteFrame pet={base} /> : displayEmoji}
        </button>
        <button className="hatch-pet-settings-btn icon-button" onClick={openSettings} data-testid="hatch-pet-settings-btn">
          <Settings size={11} />
        </button>
      </div>

      {settingsOpen && (
        <div className="hatch-pet-overlay" onClick={() => setSettingsOpen(false)}>
          <div className="hatch-pet-modal" onClick={(e) => e.stopPropagation()} data-testid="hatch-pet-modal">
            <div className="hatch-pet-modal-head">
              <h3>Your companion</h3>
              <button className="icon-button" onClick={() => setSettingsOpen(false)}><X size={16} /></button>
            </div>
            <div className="hatch-pet-grid">
              {PETS.map((p) => (
                <button
                  key={p.id}
                  className={`hatch-pet-pick ${draft.pet_id === p.id ? "selected" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, pet_id: p.id, pet_emoji: "", pet_desc: "" }))}
                  title={p.desc}
                  data-testid={`pet-pick-${p.id}`}
                >
                  <span className="hatch-pet-pick-emoji">
                    {p.spriteUrl ? <SpriteFrame pet={p} size={36} /> : p.emoji}
                  </span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>
            <label>Nickname (optional)
              <input
                value={draft.pet_name || ""}
                onChange={(e) => setDraft((d) => ({ ...d, pet_name: e.target.value }))}
                placeholder={base.name}
                data-testid="pet-name-input"
              />
            </label>
            <label>Custom emoji (optional)
              <input
                value={draft.pet_emoji || ""}
                onChange={(e) => setDraft((d) => ({ ...d, pet_emoji: e.target.value }))}
                placeholder={base.emoji}
                data-testid="pet-emoji-input"
              />
            </label>
            <label>Custom personality (optional)
              <textarea
                value={draft.pet_desc || ""}
                onChange={(e) => setDraft((d) => ({ ...d, pet_desc: e.target.value }))}
                placeholder="Describe how your companion behaves and speaks..."
                data-testid="pet-desc-input"
              />
            </label>
            <div className="hatch-pet-modal-actions">
              <label className="switch-line">
                <input
                  type="checkbox"
                  checked={draft.pet_enabled !== false}
                  onChange={(e) => setDraft((d) => ({ ...d, pet_enabled: e.target.checked }))}
                  data-testid="pet-enabled-checkbox"
                />
                Show companion
              </label>
              <button onClick={() => { updatePetPrefs(draft); setSettingsOpen(false); }} data-testid="pet-save-button">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
