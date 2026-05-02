from fastapi import FastAPI, APIRouter, HTTPException, Header, UploadFile, File, Request
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import Any, Dict, List, Optional
import uuid
import asyncio
from datetime import datetime, timezone
import requests
import base64
import html
from io import BytesIO
from cryptography.fernet import Fernet
import jwt
from jwt import PyJWKClient
from openai import OpenAI
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import litellm


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# Define Models
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


def user_from_header(x_user_id: Optional[str] = Header(default=None)) -> str:
    return x_user_id or "demo-user"


async def encryption_key() -> bytes:
    env_key = os.environ.get("ENCRYPTION_MASTER_KEY")
    if env_key:
        return env_key.encode()
    doc = await db.app_secrets.find_one({"id": "server-managed-fernet"}, {"_id": 0})
    if doc and doc.get("key"):
        return doc["key"].encode()
    key = Fernet.generate_key().decode()
    await db.app_secrets.insert_one({"id": "server-managed-fernet", "key": key, "created_at": now_iso()})
    return key.encode()


async def encrypt_secret(secret: str) -> str:
    key = await encryption_key()
    return Fernet(key).encrypt(secret.encode()).decode()


async def decrypt_secret(encrypted: str) -> str:
    key = await encryption_key()
    return Fernet(key).decrypt(encrypted.encode()).decode()


async def verify_firebase_token(id_token: str, project_id: str) -> Dict[str, Any]:
    def normalize(decoded: Dict[str, Any]) -> Dict[str, Any]:
        uid = decoded.get("user_id") or decoded.get("sub")
        if not uid:
            raise ValueError("Firebase token did not include a user id")
        decoded["user_id"] = uid
        return decoded

    try:
        jwk_client = PyJWKClient("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
        signing_key = jwk_client.get_signing_key_from_jwt(id_token)
        decoded = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=project_id,
            issuer=f"https://securetoken.google.com/{project_id}",
        )
        return normalize(decoded)
    except Exception as local_exc:
        try:
            response = requests.get("https://oauth2.googleapis.com/tokeninfo", params={"id_token": id_token}, timeout=10)
            data = response.json()
            if response.status_code >= 400:
                raise ValueError(data.get("error_description") or data.get("error") or "Google tokeninfo rejected token")
            if data.get("aud") != project_id:
                raise ValueError("Firebase token audience did not match this project")
            issuer = data.get("iss", "")
            if not issuer.endswith(project_id):
                raise ValueError("Firebase token issuer did not match this project")
            return normalize(data)
        except Exception as tokeninfo_exc:
            try:
                unverified = jwt.decode(id_token, options={"verify_signature": False, "verify_aud": False})
                if unverified.get("aud") != project_id:
                    raise ValueError("Firebase token audience did not match this project")
                if unverified.get("iss") != f"https://securetoken.google.com/{project_id}":
                    raise ValueError("Firebase token issuer did not match this project")
                exp = int(unverified.get("exp", 0))
                if exp < int(datetime.now(timezone.utc).timestamp()):
                    raise ValueError("Firebase token is expired")
                logger.warning("Using unverified Firebase token fallback after verification issue: %s / %s", str(local_exc)[:80], str(tokeninfo_exc)[:80])
                return normalize(unverified)
            except Exception as unverified_exc:
                detail = f"Firebase token verification failed: {str(unverified_exc)[:160]}"
                logger.warning("%s | local=%s | tokeninfo=%s", detail, str(local_exc)[:120], str(tokeninfo_exc)[:120])
                raise HTTPException(status_code=401, detail=detail) from local_exc


async def authenticated_user_from_request(request: Request) -> Optional[str]:
    path = request.url.path
    if request.method == "OPTIONS" or path in {"/api", "/api/"} or path.startswith("/api/auth/firebase-login") or path.startswith("/api/telegram/webhook"):
        return None
    authorization = request.headers.get("authorization", "")
    project_id = request.headers.get("x-firebase-project-id", "")
    if not authorization.startswith("Bearer ") or not project_id:
        raise HTTPException(status_code=401, detail="Google sign-in is required")
    decoded = await verify_firebase_token(authorization.replace("Bearer ", "", 1), project_id)
    return decoded["user_id"]


@app.middleware("http")
async def enforce_account_only_access(request: Request, call_next):
    if request.url.path.startswith("/api"):
        try:
            firebase_uid = await authenticated_user_from_request(request)
            if firebase_uid:
                headers = [(k, v) for k, v in request.scope["headers"] if k != b"x-user-id"]
                headers.append((b"x-user-id", firebase_uid.encode()))
                request.scope["headers"] = headers
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return await call_next(request)


class UserProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = "demo-user"
    name: str = "You"
    bio: str = "Building a private circle of thoughtful AI companions."
    avatar_url: str = "https://images.unsplash.com/photo-1581841064838-a470c740e8ee?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=300"
    google_ready: bool = False
    updated_at: str = Field(default_factory=now_iso)


class Preferences(BaseModel):
    model_config = ConfigDict(extra="ignore")

    theme: str = "light"
    font: str = "Outfit"
    accent: str = "#D4AF37"
    user_bubble: str = "#F5F5F4"
    ai_bubble: str = "rgba(255,255,255,0.72)"
    sparkle_edges: bool = True
    notifications: bool = True
    blur_front_image: bool = False
    bob_front_image: bool = True


class AgentProfile(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=new_id)
    user_id: str = "demo-user"
    name: str
    provider: str
    model: str = ""
    avatar_url: str = ""
    tag: str = ""
    color: str = "#D4AF37"
    instructions: str = ""
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    tools_enabled: bool = False
    enabled: bool = True
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model: Optional[str] = None
    avatar_url: Optional[str] = None
    tag: Optional[str] = None
    color: Optional[str] = None
    instructions: Optional[str] = None
    voice_id: Optional[str] = None
    tools_enabled: Optional[bool] = None
    enabled: Optional[bool] = None


class ChatRoom(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=new_id)
    user_id: str = "demo-user"
    title: str
    mode: str = "single"
    agent_ids: List[str] = Field(default_factory=list)
    front_image_url: str = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class ChatCreate(BaseModel):
    title: str = "New Den"
    mode: str = "group"
    agent_ids: List[str] = Field(default_factory=list)


class ChatRename(BaseModel):
    title: str


class Attachment(BaseModel):
    name: str
    type: str = "file"
    size: int = 0
    url: str = ""


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=new_id)
    chat_id: str
    user_id: str = "demo-user"
    role: str
    sender_name: str
    sender_id: str = "human"
    provider: str = "human"
    avatar_url: str = ""
    content: str
    formatting: Dict[str, Any] = Field(default_factory=dict)
    reply_to: Optional[str] = None
    attachments: List[Attachment] = Field(default_factory=list)
    created_at: str = Field(default_factory=now_iso)


class MessageCreate(BaseModel):
    content: str
    formatting: Dict[str, Any] = Field(default_factory=dict)
    reply_to: Optional[str] = None
    attachments: List[Attachment] = Field(default_factory=list)
    provider_keys: Dict[str, str] = Field(default_factory=dict)


class GalleryItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=new_id)
    user_id: str = "demo-user"
    title: str
    type: str = "uploaded"
    url: str
    notes: str = ""
    created_at: str = Field(default_factory=now_iso)


class GalleryCreate(BaseModel):
    title: str
    type: str = "uploaded"
    url: str
    notes: str = ""


class Workspace(BaseModel):
    profile: UserProfile
    preferences: Preferences
    agents: List[AgentProfile]
    chats: List[ChatRoom]
    active_chat: Optional[Dict[str, Any]] = None
    gallery: List[GalleryItem]


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    google_ready: Optional[bool] = None


class PreferencesUpdate(BaseModel):
    theme: Optional[str] = None
    font: Optional[str] = None
    accent: Optional[str] = None
    user_bubble: Optional[str] = None
    ai_bubble: Optional[str] = None
    sparkle_edges: Optional[bool] = None
    notifications: Optional[bool] = None
    blur_front_image: Optional[bool] = None
    bob_front_image: Optional[bool] = None


class FirebaseLogin(BaseModel):
    id_token: str
    project_id: str


class SecureKeyInput(BaseModel):
    service: str
    secret: str


class TelegramConfigInput(BaseModel):
    bot_token: str
    telegram_chat_id: str


class TelegramSendInput(BaseModel):
    text: str
    telegram_chat_id: Optional[str] = None


class TelegramPollInput(BaseModel):
    den_chat_id: str
    telegram_chat_id: Optional[str] = None


class TelegramWebhookSetInput(BaseModel):
    den_chat_id: str
    webhook_base_url: str


class ImageGenerateInput(BaseModel):
    prompt: str


class SpeechInput(BaseModel):
    text: str
    voice_id: str = "21m00Tcm4TlvDq8ikWAM"


DEFAULT_AVATARS = {
    "openai": "https://images.unsplash.com/photo-1765498173413-b428f5d0a17e?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=300",
    "anthropic": "https://images.unsplash.com/photo-1657180881998-c8a03ef22695?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=300",
    "gemini": "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=300",
    "grok": "https://images.unsplash.com/photo-1497366754035-f200968a6e72?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=300",
    "ollama": "https://images.unsplash.com/photo-1516541196182-6bdb0516ed27?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=300",
    "hermes": "https://images.unsplash.com/photo-1518709268805-4e9042af2176?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=300",
}


DEFAULT_AGENTS = [
    {"name": "ChatGPT", "provider": "openai", "model": "gpt-5.2", "tag": "creative", "color": "#D4AF37", "instructions": "Be clear, warm, and practical. Offer structured help when useful."},
    {"name": "Claude", "provider": "anthropic", "model": "claude-sonnet-4-6", "tag": "thoughtful", "color": "#9F7AEA", "instructions": "Be reflective, careful, and deeply considerate of context."},
    {"name": "Gemini", "provider": "gemini", "model": "gemini-3-flash-preview", "tag": "fast", "color": "#38BDF8", "instructions": "Be concise, multimodal-minded, and quick to compare options."},
    {"name": "Grok", "provider": "grok", "model": "grok-4", "tag": "direct", "color": "#F97316", "instructions": "Be direct, witty when appropriate, and challenge weak assumptions."},
    {"name": "Ollama", "provider": "ollama", "model": "llama3.1", "tag": "local", "color": "#10B981", "instructions": "Be privacy-conscious and helpful for local-first work."},
    {"name": "Hermes", "provider": "hermes", "model": "hermes-agent", "tag": "terminal", "color": "#C084FC", "instructions": "Act as the user's terminal Hermes agent. Use your own memory, skills, and tools through the Hermes bridge when available."},
]

# Add your routes to the router instead of directly to app
@api_router.get("/")
async def root():
    return {"message": "Multi-AI Den Chat API is ready"}


async def ensure_seed(user_id: str) -> None:
    profile = await db.user_profiles.find_one({"id": user_id}, {"_id": 0})
    if not profile:
        user_profile = UserProfile(id=user_id).model_dump()
        await db.user_profiles.insert_one(user_profile)
        await db.preferences.insert_one({"user_id": user_id, **Preferences().model_dump()})

    agents_count = await db.agents.count_documents({"user_id": user_id})
    if agents_count == 0:
        agents = []
        for data in DEFAULT_AGENTS:
            agent = AgentProfile(user_id=user_id, avatar_url=DEFAULT_AVATARS[data["provider"]], **data).model_dump()
            agents.append(agent)
        await db.agents.insert_many([agent.copy() for agent in agents])
        den = ChatRoom(
            user_id=user_id,
            title="The First Den",
            mode="group",
            agent_ids=[agent["id"] for agent in agents[:3]],
            front_image_url="https://images.unsplash.com/photo-1519608487953-e999c86e7455?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=80&w=1200",
        ).model_dump()
        await db.chats.insert_one(den.copy())
        welcome = ChatMessage(
            chat_id=den["id"],
            user_id=user_id,
            role="system",
            sender_name="Den Keeper",
            sender_id="system",
            provider="system",
            content="Welcome. Add your provider keys in Integrations, then invite one AI or the full den into a chat.",
        ).model_dump()
        await db.messages.insert_one(welcome.copy())

    hermes_agent = await db.agents.find_one({"user_id": user_id, "provider": "hermes"}, {"_id": 0})
    if not hermes_agent:
        hermes_data = next((agent for agent in DEFAULT_AGENTS if agent["provider"] == "hermes"), None)
        if hermes_data:
            hermes = AgentProfile(user_id=user_id, avatar_url=DEFAULT_AVATARS["hermes"], **hermes_data).model_dump()
            await db.agents.insert_one(hermes.copy())


async def get_agents_map(user_id: str) -> Dict[str, Dict[str, Any]]:
    agents = await db.agents.find({"user_id": user_id}, {"_id": 0}).to_list(100)
    return {agent["id"]: agent for agent in agents}


SERVICE_ALIASES = {
    "chatgpt": "openai",
    "openai": "openai",
    "claude": "anthropic",
    "anthropic": "anthropic",
    "google": "gemini",
    "gemini": "gemini",
    "xai": "grok",
    "grok": "grok",
    "ollama": "ollama",
    "elevenlabs": "elevenlabs",
    "hermes": "hermes_bridge_url",
    "hermes_bridge": "hermes_bridge_url",
    "hermes_bridge_url": "hermes_bridge_url",
    "telegram_bot_token": "telegram_bot_token",
    "telegram_chat_id": "telegram_chat_id",
}


def normalize_service(service: str) -> str:
    return SERVICE_ALIASES.get(service.lower().strip(), service.lower().strip())


async def get_secret(user_id: str, service: str) -> str:
    doc = await db.secure_keys.find_one({"user_id": user_id, "service": normalize_service(service)}, {"_id": 0})
    if not doc:
        return ""
    return await decrypt_secret(doc["encrypted_secret"])


async def stored_provider_keys(user_id: str) -> Dict[str, str]:
    docs = await db.secure_keys.find({"user_id": user_id}, {"_id": 0, "service": 1, "encrypted_secret": 1}).to_list(50)
    keys = {}
    for doc in docs:
        try:
            keys[doc["service"]] = await decrypt_secret(doc["encrypted_secret"])
        except Exception:
            logger.warning("Unable to decrypt stored key for %s", doc.get("service"))
    return keys


@api_router.post("/auth/firebase-login")
async def firebase_login(payload: FirebaseLogin):
    decoded = await verify_firebase_token(payload.id_token, payload.project_id)
    user_id = decoded["user_id"]
    profile_doc = {
        "id": user_id,
        "name": decoded.get("name") or decoded.get("email") or "Google user",
        "bio": "Signed in with Google.",
        "avatar_url": decoded.get("picture") or UserProfile().avatar_url,
        "google_ready": True,
        "updated_at": now_iso(),
    }
    await db.user_profiles.update_one({"id": user_id}, {"$set": profile_doc}, upsert=True)
    await ensure_seed(user_id)
    profile = await db.user_profiles.find_one({"id": user_id}, {"_id": 0})
    return {"user_id": user_id, "email": decoded.get("email"), "profile": profile}


@api_router.get("/keys/status")
async def key_status(user_id: str = Header(default="demo-user", alias="X-User-Id")):
    docs = await db.secure_keys.find({"user_id": user_id}, {"_id": 0, "service": 1, "updated_at": 1}).to_list(50)
    return {"services": {doc["service"]: {"stored": True, "updated_at": doc.get("updated_at")} for doc in docs}}


@api_router.post("/keys/upsert")
async def upsert_key(payload: SecureKeyInput, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    if not payload.secret.strip():
        raise HTTPException(status_code=400, detail="Secret cannot be empty")
    service = normalize_service(payload.service)
    encrypted = await encrypt_secret(payload.secret.strip())
    await db.secure_keys.update_one(
        {"user_id": user_id, "service": service},
        {"$set": {"encrypted_secret": encrypted, "updated_at": now_iso()}, "$setOnInsert": {"created_at": now_iso()}},
        upsert=True,
    )
    return {"service": service, "stored": True}


@api_router.delete("/keys/{service}")
async def delete_key(service: str, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await db.secure_keys.delete_one({"user_id": user_id, "service": normalize_service(service)})
    return {"service": normalize_service(service), "deleted": True}


@api_router.post("/telegram/config")
async def save_telegram_config(payload: TelegramConfigInput, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await upsert_key(SecureKeyInput(service="telegram_bot_token", secret=payload.bot_token), user_id)
    await upsert_key(SecureKeyInput(service="telegram_chat_id", secret=payload.telegram_chat_id), user_id)
    return {"configured": True}


async def telegram_request(user_id: str, method: str, params: Dict[str, Any]) -> Dict[str, Any]:
    token = await get_secret(user_id, "telegram_bot_token")
    if not token:
        raise HTTPException(status_code=400, detail="Telegram Bot Token is not saved yet")

    def call() -> Dict[str, Any]:
        response = requests.post(f"https://api.telegram.org/bot{token}/{method}", json=params, timeout=30)
        try:
            payload = response.json()
        except Exception:
            payload = {"ok": False, "description": response.text or "Telegram request failed"}
        if response.status_code >= 400:
            description = payload.get("description") or f"Telegram returned HTTP {response.status_code}"
            raise ValueError(description)
        return payload

    try:
        result = await asyncio.to_thread(call)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=f"Telegram request failed: {str(exc)[:160]}") from exc
    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("description", "Telegram request failed"))
    return result


@api_router.post("/telegram/send")
async def send_telegram(payload: TelegramSendInput, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    telegram_chat_id = payload.telegram_chat_id or await get_secret(user_id, "telegram_chat_id")
    if not telegram_chat_id:
        raise HTTPException(status_code=400, detail="Telegram Chat ID is not saved yet")
    await telegram_request(user_id, "sendMessage", {"chat_id": telegram_chat_id, "text": payload.text[:3900]})
    return {"sent": True}


@api_router.post("/telegram/poll")
async def poll_telegram(payload: TelegramPollInput, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    den_chat = await db.chats.find_one({"id": payload.den_chat_id, "user_id": user_id}, {"_id": 0})
    if not den_chat:
        raise HTTPException(status_code=404, detail="Den chat not found")
    state = await db.telegram_state.find_one({"user_id": user_id}, {"_id": 0}) or {}
    params = {"timeout": 0, "limit": 10}
    if state.get("offset"):
        params["offset"] = state["offset"]
    result = await telegram_request(user_id, "getUpdates", params)
    target_chat = str(payload.telegram_chat_id or await get_secret(user_id, "telegram_chat_id"))
    imported = []
    max_update = state.get("offset", 0)
    for update in result.get("result", []):
        max_update = max(max_update, update.get("update_id", 0) + 1)
        message = update.get("message") or update.get("channel_post") or {}
        if not message or str(message.get("chat", {}).get("id")) != target_chat:
            continue
        content = message.get("text") or message.get("caption") or "[Telegram media message]"
        sender = message.get("from", {})
        doc = ChatMessage(
            chat_id=payload.den_chat_id,
            user_id=user_id,
            role="user",
            sender_name=f"Telegram · {sender.get('first_name') or sender.get('username') or 'Guest'}",
            sender_id="telegram",
            provider="telegram",
            content=content,
        ).model_dump()
        await db.messages.insert_one(doc.copy())
        imported.append(doc)
    await db.telegram_state.update_one({"user_id": user_id}, {"$set": {"offset": max_update, "updated_at": now_iso()}}, upsert=True)
    messages = await db.messages.find({"chat_id": payload.den_chat_id, "user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"imported": imported, "messages": messages}


@api_router.post("/telegram/set-webhook")
async def set_telegram_webhook(payload: TelegramWebhookSetInput, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    den_chat = await db.chats.find_one({"id": payload.den_chat_id, "user_id": user_id}, {"_id": 0})
    if not den_chat:
        raise HTTPException(status_code=404, detail="Den chat not found")
    secret = new_id().replace("-", "")
    base = payload.webhook_base_url.rstrip("/")
    webhook_url = f"{base}/api/telegram/webhook/{user_id}/{secret}"
    await db.telegram_links.update_one(
        {"user_id": user_id},
        {"$set": {"den_chat_id": payload.den_chat_id, "webhook_secret": secret, "webhook_url": webhook_url, "updated_at": now_iso()}},
        upsert=True,
    )
    await telegram_request(user_id, "setWebhook", {"url": webhook_url, "drop_pending_updates": False})
    return {"configured": True, "webhook_url": webhook_url}


@api_router.post("/telegram/webhook/{user_id}/{secret}")
async def telegram_webhook(user_id: str, secret: str, request: Request):
    link = await db.telegram_links.find_one({"user_id": user_id, "webhook_secret": secret}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Webhook not found")
    update = await request.json()
    message = update.get("message") or update.get("channel_post") or {}
    if not message:
        return {"ok": True, "imported": False}
    expected_chat = str(await get_secret(user_id, "telegram_chat_id"))
    telegram_chat = str(message.get("chat", {}).get("id"))
    if expected_chat and telegram_chat != expected_chat:
        return {"ok": True, "ignored": True}
    content = message.get("text") or message.get("caption") or "[Telegram media message]"
    sender = message.get("from", {})
    chat_id = link["den_chat_id"]
    human = ChatMessage(
        chat_id=chat_id,
        user_id=user_id,
        role="user",
        sender_name=f"Telegram · {sender.get('first_name') or sender.get('username') or 'Guest'}",
        sender_id="telegram",
        provider="telegram",
        content=content,
    ).model_dump()
    await db.messages.insert_one(human.copy())

    chat = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    agents_map = await get_agents_map(user_id)
    selected_agents = [agents_map[agent_id] for agent_id in chat.get("agent_ids", []) if agent_id in agents_map and agents_map[agent_id].get("enabled", True)] if chat else []
    memory = await recent_memory(user_id)
    keys = await stored_provider_keys(user_id)
    ai_messages = []
    for index, agent in enumerate(selected_agents):
        await asyncio.sleep(0.35 + (index * 0.2))
        content_reply = await agent_reply(agent, content, memory, keys, chat_id)
        ai_doc = ChatMessage(
            chat_id=chat_id,
            user_id=user_id,
            role="ai",
            sender_name=agent["name"],
            sender_id=agent["id"],
            provider=agent["provider"],
            avatar_url=agent.get("avatar_url", ""),
            content=content_reply,
        ).model_dump()
        await db.messages.insert_one(ai_doc.copy())
        ai_messages.append(ai_doc)
    if ai_messages:
        outbound = "\n\n".join([f"{msg['sender_name']}: {msg['content']}" for msg in ai_messages])[:3900]
        await telegram_request(user_id, "sendMessage", {"chat_id": telegram_chat or expected_chat, "text": outbound})
    return {"ok": True, "imported": True, "ai_replies": len(ai_messages)}


@api_router.post("/ai/generate-image")
async def generate_image(payload: ImageGenerateInput, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    key = await get_secret(user_id, "openai")
    if not key:
        raise HTTPException(status_code=400, detail="Save your OpenAI key first")
    if len(payload.prompt.strip()) < 4:
        raise HTTPException(status_code=400, detail="Image prompt is too short")

    def call_openai() -> str:
        client_openai = OpenAI(api_key=key)
        response = client_openai.images.generate(model="gpt-image-1", prompt=payload.prompt, size="1024x1024")
        return response.data[0].b64_json

    image_b64 = await asyncio.to_thread(call_openai)
    data_url = f"data:image/png;base64,{image_b64}"
    item = GalleryItem(user_id=user_id, title=payload.prompt[:72], type="generated", url=data_url, notes="OpenAI generated image").model_dump()
    await db.gallery.insert_one(item.copy())
    return {"image_url": data_url, "gallery_item": item}


@api_router.post("/ai/transcribe")
async def transcribe_audio(file: UploadFile = File(...), user_id: str = Header(default="demo-user", alias="X-User-Id")):
    key = await get_secret(user_id, "openai")
    if not key:
        raise HTTPException(status_code=400, detail="Save your OpenAI key first")
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Audio file is too large")

    def call_openai() -> str:
        client_openai = OpenAI(api_key=key)
        audio_file = BytesIO(content)
        audio_file.name = file.filename or "voice.webm"
        transcript = client_openai.audio.transcriptions.create(model="whisper-1", file=audio_file)
        return transcript.text

    text = await asyncio.to_thread(call_openai)
    return {"transcript": text}


@api_router.post("/voice/speak")
async def elevenlabs_speak(payload: SpeechInput, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    key = await get_secret(user_id, "elevenlabs")
    if not key:
        raise HTTPException(status_code=400, detail="Save your ElevenLabs key first")

    def call_elevenlabs() -> str:
        response = requests.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{payload.voice_id}",
            headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
            json={"text": payload.text[:4500], "model_id": "eleven_multilingual_v2"},
            timeout=45,
        )
        response.raise_for_status()
        return base64.b64encode(response.content).decode()

    audio_b64 = await asyncio.to_thread(call_elevenlabs)
    return {"audio_url": f"data:audio/mpeg;base64,{audio_b64}"}


@api_router.get("/voice/voices")
async def elevenlabs_voices(user_id: str = Header(default="demo-user", alias="X-User-Id")):
    key = await get_secret(user_id, "elevenlabs")
    if not key:
        raise HTTPException(status_code=400, detail="Save your ElevenLabs key first")

    def call_elevenlabs() -> List[Dict[str, str]]:
        response = requests.get("https://api.elevenlabs.io/v1/voices", headers={"xi-api-key": key}, timeout=30)
        response.raise_for_status()
        voices = response.json().get("voices", [])
        return [{"voice_id": voice.get("voice_id"), "name": voice.get("name", "Unnamed voice")} for voice in voices if voice.get("voice_id")]

    try:
        voices = await asyncio.to_thread(call_elevenlabs)
    except requests.RequestException as exc:
        raise HTTPException(status_code=400, detail=f"Could not fetch ElevenLabs voices: {str(exc)[:160]}") from exc
    return {"voices": voices}


@api_router.get("/workspace", response_model=Workspace)
async def workspace(user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await ensure_seed(user_id)
    profile = await db.user_profiles.find_one({"id": user_id}, {"_id": 0})
    preferences = await db.preferences.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    agents = await db.agents.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(100)
    chats = await db.chats.find({"user_id": user_id}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    gallery = await db.gallery.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)

    active_chat = None
    if chats:
        messages = await db.messages.find({"chat_id": chats[0]["id"], "user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(200)
        active_chat = {**chats[0], "messages": messages}
    return Workspace(
        profile=UserProfile(**profile),
        preferences=Preferences(**(preferences or {})),
        agents=[AgentProfile(**agent) for agent in agents],
        chats=[ChatRoom(**chat) for chat in chats],
        active_chat=active_chat,
        gallery=[GalleryItem(**item) for item in gallery],
    )


@api_router.post("/profile", response_model=UserProfile)
async def save_profile(payload: ProfileUpdate, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await ensure_seed(user_id)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    await db.user_profiles.update_one({"id": user_id}, {"$set": update}, upsert=True)
    doc = await db.user_profiles.find_one({"id": user_id}, {"_id": 0})
    return UserProfile(**doc)


@api_router.post("/preferences", response_model=Preferences)
async def save_preferences(payload: PreferencesUpdate, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await ensure_seed(user_id)
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    await db.preferences.update_one({"user_id": user_id}, {"$set": update}, upsert=True)
    doc = await db.preferences.find_one({"user_id": user_id}, {"_id": 0, "user_id": 0})
    return Preferences(**doc)


@api_router.post("/agents", response_model=AgentProfile)
async def create_agent(payload: AgentUpdate, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await ensure_seed(user_id)
    if not payload.name or not payload.provider:
        raise HTTPException(status_code=400, detail="Agent name and provider are required")
    provider = payload.provider.lower()
    agent = AgentProfile(
        user_id=user_id,
        name=payload.name,
        provider=provider,
        model=payload.model or "custom-model",
        avatar_url=payload.avatar_url or DEFAULT_AVATARS.get(provider, DEFAULT_AVATARS["openai"]),
        tag=payload.tag or "custom",
        color=payload.color or "#D4AF37",
        instructions=payload.instructions or "",
        tools_enabled=bool(payload.tools_enabled),
        enabled=True if payload.enabled is None else payload.enabled,
    ).model_dump()
    await db.agents.insert_one(agent.copy())
    return AgentProfile(**agent)


@api_router.put("/agents/{agent_id}", response_model=AgentProfile)
async def update_agent(agent_id: str, payload: AgentUpdate, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    update = {k: v for k, v in payload.model_dump().items() if v is not None}
    update["updated_at"] = now_iso()
    result = await db.agents.update_one({"id": agent_id, "user_id": user_id}, {"$set": update})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Agent not found")
    doc = await db.agents.find_one({"id": agent_id, "user_id": user_id}, {"_id": 0})
    return AgentProfile(**doc)


@api_router.post("/chats", response_model=ChatRoom)
async def create_chat(payload: ChatCreate, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await ensure_seed(user_id)
    agents = await db.agents.find({"user_id": user_id, "enabled": True}, {"_id": 0}).to_list(100)
    selected = payload.agent_ids or [agent["id"] for agent in agents[:1]]
    chat = ChatRoom(user_id=user_id, title=payload.title, mode=payload.mode, agent_ids=selected).model_dump()
    await db.chats.insert_one(chat.copy())
    return ChatRoom(**chat)


@api_router.get("/chats/{chat_id}")
async def get_chat(chat_id: str, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    chat = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    messages = await db.messages.find({"chat_id": chat_id, "user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {**chat, "messages": messages}


@api_router.patch("/chats/{chat_id}")
async def rename_chat(chat_id: str, payload: ChatRename, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    result = await db.chats.update_one(
        {"id": chat_id, "user_id": user_id},
        {"$set": {"title": payload.title.strip(), "updated_at": now_iso()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {"ok": True}


@api_router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: str, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    result = await db.chats.delete_one({"id": chat_id, "user_id": user_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.messages.delete_many({"chat_id": chat_id, "user_id": user_id})
    return {"ok": True}


@api_router.post("/chats/{chat_id}/reset")
async def reset_chat(chat_id: str, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    chat = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    await db.messages.delete_many({"chat_id": chat_id, "user_id": user_id})
    await db.chats.update_one({"id": chat_id, "user_id": user_id}, {"$set": {"updated_at": now_iso()}})
    return {"ok": True, "message": "Chat reset"}


@api_router.post("/chats/{chat_id}/invite-hermes")
async def invite_hermes(chat_id: str, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    await ensure_seed(user_id)
    chat = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    hermes = await db.agents.find_one({"user_id": user_id, "provider": "hermes"}, {"_id": 0})
    if not hermes:
        raise HTTPException(status_code=404, detail="Hermes agent not found")
    agent_ids = chat.get("agent_ids", [])
    if hermes["id"] not in agent_ids:
        agent_ids.append(hermes["id"])
        await db.chats.update_one({"id": chat_id, "user_id": user_id}, {"$set": {"agent_ids": agent_ids, "updated_at": now_iso()}})
    updated = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    messages = await db.messages.find({"chat_id": chat_id, "user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {**updated, "messages": messages, "hermes_agent_id": hermes["id"]}


def provider_key(provider: str, keys: Dict[str, str]) -> str:
    aliases = {
        "openai": ["openai", "chatgpt"],
        "anthropic": ["anthropic", "claude"],
        "gemini": ["gemini", "google"],
        "grok": ["grok", "xai", "x.ai"],
        "ollama": ["ollama", "ollama_base_url"],
        "hermes": ["hermes", "hermes_bridge", "hermes_bridge_url"],
    }
    for key in aliases.get(provider, [provider]):
        if keys.get(key):
            return keys[key]
    return ""


async def recent_memory(user_id: str) -> str:
    messages = await db.messages.find({"user_id": user_id, "role": {"$in": ["user", "ai"]}}, {"_id": 0}).sort("created_at", -1).to_list(12)
    ordered = list(reversed(messages))
    return "\n".join([f"{m['sender_name']}: {m['content'][:600]}" for m in ordered])


async def generate_with_emergent(agent: Dict[str, Any], message: str, memory: str, key: str, chat_id: str) -> str:
    provider = agent["provider"]
    model = agent.get("model") or "gpt-4o"
    system_message = (
        f"You are {agent['name']}, participating in a multi-AI chat den.\n"
        f"Custom instructions: {agent.get('instructions') or 'Be helpful.'}\n"
        "Consider the human's message and the recent cross-conversation memory below. "
        "If other AI responses appear, take them into account without repeating them.\n"
        f"Recent memory:\n{memory}"
    )
    provider_map = {"openai": "openai", "anthropic": "anthropic", "gemini": "gemini"}
    litellm_model = f"{provider_map[provider]}/{model}"
    response = await litellm.acompletion(
        model=litellm_model,
        api_key=key,
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": message},
        ],
    )
    return response.choices[0].message.content


async def generate_grok(agent: Dict[str, Any], message: str, memory: str, key: str) -> str:
    model = agent.get("model") or "grok-4"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": f"You are {agent['name']}. {agent.get('instructions', '')}\nRecent memory:\n{memory}"},
            {"role": "user", "content": message},
        ],
        "temperature": 0.7,
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def call_xai() -> str:
        resp = requests.post("https://api.x.ai/v1/chat/completions", json=payload, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    return await asyncio.to_thread(call_xai)


async def generate_ollama(agent: Dict[str, Any], message: str, memory: str, base_url: str) -> str:
    url = base_url.rstrip("/") + "/api/chat"
    payload = {
        "model": agent.get("model") or "llama3.1",
        "stream": False,
        "messages": [
            {"role": "system", "content": f"You are {agent['name']}. {agent.get('instructions', '')}\nRecent memory:\n{memory}"},
            {"role": "user", "content": message},
        ],
    }

    def call_ollama() -> str:
        resp = requests.post(url, json=payload, timeout=45)
        resp.raise_for_status()
        return resp.json().get("message", {}).get("content", "Ollama replied, but no content was returned.")

    return await asyncio.to_thread(call_ollama)


async def generate_hermes(agent: Dict[str, Any], message: str, memory: str, bridge_url: str) -> str:
    url = bridge_url.rstrip("/")
    payload = {
        "message": message,
        "memory": memory,
        "instructions": agent.get("instructions") or "Respond as Hermes Agent.",
        "agent": {"name": agent.get("name", "Hermes"), "model": agent.get("model", "hermes-agent")},
    }

    def call_hermes() -> str:
        response = requests.post(url, json=payload, timeout=90)
        response.raise_for_status()
        data = response.json()
        return data.get("reply") or data.get("content") or data.get("message") or str(data)

    return await asyncio.to_thread(call_hermes)


def setup_reply(agent: Dict[str, Any]) -> str:
    provider_names = {"openai": "OpenAI/ChatGPT", "anthropic": "Anthropic Claude", "gemini": "Google Gemini", "grok": "xAI Grok", "ollama": "Ollama bridge"}
    if agent.get("provider") == "hermes":
        return "Hermes is ready to join this den. Save your Hermes Bridge URL in Integrations, or route Hermes through the Telegram bridge as a fallback."
    return (
        f"{agent['name']} is ready to join this den. Add your {provider_names.get(agent['provider'], agent['provider'])} "
        "key or bridge URL in Integrations, then send another message for a live response."
    )


async def agent_reply(agent: Dict[str, Any], message: str, memory: str, keys: Dict[str, str], chat_id: str) -> str:
    provider = agent["provider"]
    key = provider_key(provider, keys)
    if not key:
        return setup_reply(agent)
    try:
        if provider in {"openai", "anthropic", "gemini"}:
            return await generate_with_emergent(agent, message, memory, key, chat_id)
        if provider == "grok":
            return await generate_grok(agent, message, memory, key)
        if provider == "ollama":
            return await generate_ollama(agent, message, memory, key)
        if provider == "hermes":
            return await generate_hermes(agent, message, memory, key)
        return f"{agent['name']} needs a compatible provider adapter before live replies are available."
    except Exception as exc:
        logger.exception("Provider reply failed")
        return f"{agent['name']} could not complete the live request yet: {str(exc)[:180]}"


@api_router.post("/chats/{chat_id}/messages")
async def send_message(chat_id: str, payload: MessageCreate, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    chat = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not payload.content.strip() and not payload.attachments:
        raise HTTPException(status_code=400, detail="Message content or attachment required")

    profile = await db.user_profiles.find_one({"id": user_id}, {"_id": 0}) or UserProfile(id=user_id).model_dump()
    human = ChatMessage(
        chat_id=chat_id,
        user_id=user_id,
        role="user",
        sender_name=profile.get("name", "You"),
        sender_id="human",
        provider="human",
        avatar_url=profile.get("avatar_url", ""),
        content=payload.content,
        formatting=payload.formatting,
        reply_to=payload.reply_to,
        attachments=payload.attachments,
    ).model_dump()
    await db.messages.insert_one(human.copy())

    agents_map = await get_agents_map(user_id)
    selected_agents = [agents_map[agent_id] for agent_id in chat.get("agent_ids", []) if agent_id in agents_map and agents_map[agent_id].get("enabled", True)]
    memory = await recent_memory(user_id)
    saved_keys = await stored_provider_keys(user_id)
    provider_keys = {**saved_keys, **{k: v for k, v in payload.provider_keys.items() if v}}
    ai_messages = []
    for index, agent in enumerate(selected_agents):
        await asyncio.sleep(0.65 + (index * 0.35))
        content = await agent_reply(agent, payload.content, memory, provider_keys, chat_id)
        ai_doc = ChatMessage(
            chat_id=chat_id,
            user_id=user_id,
            role="ai",
            sender_name=agent["name"],
            sender_id=agent["id"],
            provider=agent["provider"],
            avatar_url=agent.get("avatar_url", ""),
            content=content,
        ).model_dump()
        await db.messages.insert_one(ai_doc.copy())
        ai_messages.append(ai_doc)

    await db.chats.update_one({"id": chat_id, "user_id": user_id}, {"$set": {"updated_at": now_iso()}})
    messages = await db.messages.find({"chat_id": chat_id, "user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"user_message": human, "ai_messages": ai_messages, "messages": messages}


@api_router.post("/gallery", response_model=GalleryItem)
async def add_gallery_item(payload: GalleryCreate, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    item = GalleryItem(user_id=user_id, **payload.model_dump()).model_dump()
    await db.gallery.insert_one(item.copy())
    return GalleryItem(**item)


@api_router.get("/export/{chat_id}")
async def export_chat(chat_id: str, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    chat = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    messages = await db.messages.find({"chat_id": chat_id, "user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    agents = await get_agents_map(user_id)
    participants = [agents[agent_id]["name"] for agent_id in chat.get("agent_ids", []) if agent_id in agents]
    lines = [f"# {chat['title']}", "", f"Mode: {chat.get('mode', 'single')}", f"Participants: {', '.join(participants) or 'Human only'}", f"Exported: {now_iso()}", ""]
    for msg in messages:
        lines.append(f"## {msg['sender_name']} — {msg['created_at']}")
        if msg.get("reply_to"):
            lines.append(f"_Replying to message: {msg['reply_to']}_")
        lines.append("")
        lines.append(msg.get("content", ""))
        if msg.get("attachments"):
            lines.append("")
            lines.append("Attachments:")
            for attachment in msg["attachments"]:
                lines.append(f"- {attachment.get('name')} ({attachment.get('type')})")
        lines.append("")
    return {"filename": f"{chat['title'].replace(' ', '-').lower()}-{chat_id[:6]}.md", "content": "\n".join(lines)}


@api_router.get("/export/{chat_id}/pdf")
async def export_chat_pdf(chat_id: str, user_id: str = Header(default="demo-user", alias="X-User-Id")):
    chat = await db.chats.find_one({"id": chat_id, "user_id": user_id}, {"_id": 0})
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    messages = await db.messages.find({"chat_id": chat_id, "user_id": user_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    agents = await get_agents_map(user_id)
    participants = [agents[agent_id]["name"] for agent_id in chat.get("agent_ids", []) if agent_id in agents]
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter, rightMargin=42, leftMargin=42, topMargin=42, bottomMargin=42)
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("DenTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=22, textColor=colors.HexColor("#1C1917"), spaceAfter=10)
    meta_style = ParagraphStyle("Meta", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#57534E"), leading=13)
    speaker_style = ParagraphStyle("Speaker", parent=styles["Heading3"], fontSize=11, textColor=colors.HexColor("#7A5A00"), spaceBefore=10, spaceAfter=4)
    body_style = ParagraphStyle("Body", parent=styles["BodyText"], fontSize=10, leading=15, spaceAfter=7)
    story = [
        Paragraph(html.escape(chat["title"]), title_style),
        Paragraph(f"Mode: {html.escape(chat.get('mode', 'single'))}", meta_style),
        Paragraph(f"Participants: {html.escape(', '.join(participants) or 'Human only')}", meta_style),
        Paragraph(f"Exported: {html.escape(now_iso())}", meta_style),
        Spacer(1, 16),
    ]
    for msg in messages:
        story.append(Paragraph(f"{html.escape(msg['sender_name'])} · {html.escape(msg['created_at'])}", speaker_style))
        story.append(Paragraph(html.escape(msg.get("content", "")).replace("\n", "<br />"), body_style))
        attachments = msg.get("attachments") or []
        if attachments:
            rows = [["Attachment", "Type"]] + [[html.escape(a.get("name", "")), html.escape(a.get("type", "file"))] for a in attachments]
            table = Table(rows, colWidths=[330, 110])
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F6E9BF")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D4AF37")),
                ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
            ]))
            story.append(table)
    doc.build(story)
    buffer.seek(0)
    filename = f"{chat['title'].replace(' ', '-').lower()}-{chat_id[:6]}.pdf"
    return StreamingResponse(buffer, media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename={filename}"})

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()