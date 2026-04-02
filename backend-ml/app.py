# app.py
from fastapi import FastAPI, HTTPException, File, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import joblib
import os
import json
import bcrypt
import shutil

# --- Local Imports ---
from database import get_db_connection
from fastapi.middleware.cors import CORSMiddleware
from psycopg2 import Error as DatabaseError

# --- ML model paths & lazy loader ---
VECT_PATH = os.path.join("models", "vectorizer.joblib")
MODEL_PATH = os.path.join("models", "model.joblib")
vectorizer = None
model = None

def ensure_model_loaded():
    """
    Try to load vectorizer/model once. If files missing or load fails,
    vectorizer/model remain None and classify_text will treat messages as clean.
    """
    global vectorizer, model
    if vectorizer is not None and model is not None:
        return
    try:
        if os.path.exists(VECT_PATH) and os.path.exists(MODEL_PATH):
            vectorizer = joblib.load(VECT_PATH)
            model = joblib.load(MODEL_PATH)
            print("Models loaded successfully.")
        else:
            print(f"Model files not found at {VECT_PATH} or {MODEL_PATH}. Running without ML (all text treated as clean).")
            vectorizer = None
            model = None
    except Exception as e:
        print(f"Failed to load models: {e}. Running without ML (all text treated as clean).")
        vectorizer = None
        model = None

def classify_text(text: str):
    """
    Return (label, prob).
    If model isn't available or an error occurs -> treat as clean, prob 0.0
    Label values: "toxic" or "clean"
    """
    ensure_model_loaded()
    try:
        if vectorizer is None or model is None:
            return "clean", 0.0
        vect_text = vectorizer.transform([text])
        prob = model.predict_proba(vect_text)[0][1]
        label = "toxic" if prob >= 0.7 else "clean"
        return label, float(prob)
    except Exception as e:
        print(f"Error in classify_text: {e}. Treating as clean.")
        return "clean", 0.0

app = FastAPI(title="SafeChat Backend")

# --- CORS Middleware (local dev) ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Static Uploads Folder ---
UPLOADS_DIR = "uploads"
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


# --- Pydantic Models ---
class UserSignUp(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class AuthResponse(BaseModel):
    status: str
    message: str
    username: Optional[str] = None  # allow None

class Message(BaseModel):  # For Chat
    user: str  # sender's username
    text: str
    receiver_username: str  # who the message is for

class FeedResponse(BaseModel):  # For Chat
    messages: List[dict]
    notification: Optional[str] = None  # allow None

class NewPost(BaseModel):  # For Posts AND Comments
    user: str
    text: str
    parent_id: Optional[int] = None

class PostResponse(BaseModel):
    post: dict
    notification: Optional[str] = None

class ReportedPost(BaseModel):
    id: int
    post_id: Optional[int] = None
    text: Optional[str] = None
    created_at: Optional[datetime] = None
    username: Optional[str] = None

class ProfileUpdate(BaseModel):
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None

class ProfileData(BaseModel):
    username: str
    email: str
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None


class UserListItem(BaseModel):
    username: str


class TypingStatusUpdate(BaseModel):
    user: str
    receiver_username: str
    is_typing: bool


class TypingStatusResponse(BaseModel):
    username: str
    is_typing: bool


class ChatNotificationItem(BaseModel):
    id: int
    from_user: str
    text: str
    created_at: datetime


class MessageReportCreate(BaseModel):
    reporter_username: str
    message_id: int
    reason: str
    description: Optional[str] = None


class MessageReportItem(BaseModel):
    report_id: int
    message_id: int
    reporter_id: int
    reporter_username: str
    reported_user_id: int
    reported_username: str
    message_text: Optional[str] = None
    reason: str
    description: Optional[str] = None
    status: str
    created_at: datetime
    reviewed_by: Optional[int] = None
    reviewed_at: Optional[datetime] = None


class ReportActionResponse(BaseModel):
    status: str
    message: str


class ReportReviewPayload(BaseModel):
    reviewed_by_username: Optional[str] = None


# --- Helper to safely close cursors ---
def safe_close_cursor(cursor):
    try:
        if cursor is not None:
            cursor.close()
    except Exception:
        pass


# --- Helper function to get user ID ---
def get_user_id(username: str, db):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        user_row = cursor.fetchone()
        safe_close_cursor(cursor)
        if not user_row:
            return None
        return user_row["id"]
    except DatabaseError as e:
        print(f"Error in get_user_id: {e}")
        safe_close_cursor(cursor)
        return None
    except Exception as e:
        print(f"Unexpected error in get_user_id: {e}")
        safe_close_cursor(cursor)
        return None


def get_chat_usernames(current_username: str, db):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            "SELECT username FROM users WHERE username <> %s ORDER BY username ASC",
            (current_username,),
        )
        rows = cursor.fetchall() or []
        return [{"username": row["username"]} for row in rows]
    except Exception as e:
        print(f"Error in get_chat_usernames: {e}")
        return []
    finally:
        safe_close_cursor(cursor)


def get_chat_message_by_id(message_id: int, db):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT m.id, m.sender_id, m.receiver_id, m.text, m.status, m.created_at,
                   sender.username AS sender_username,
                   receiver.username AS receiver_username
            FROM chat_messages m
            JOIN users sender ON m.sender_id = sender.id
            JOIN users receiver ON m.receiver_id = receiver.id
            WHERE m.id = %s
            """,
            (message_id,),
        )
        return cursor.fetchone()
    finally:
        safe_close_cursor(cursor)


def get_message_report_item(report_id: int, db):
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                r.id AS report_id,
                r.message_id,
                r.reporter_id,
                reporter.username AS reporter_username,
                r.reported_user_id,
                reported.username AS reported_username,
                m.text AS message_text,
                r.reason,
                r.description,
                r.status,
                r.created_at,
                r.reviewed_by,
                r.reviewed_at
            FROM message_reports r
            JOIN users reporter ON reporter.id = r.reporter_id
            JOIN users reported ON reported.id = r.reported_user_id
            LEFT JOIN chat_messages m ON m.id = r.message_id
            WHERE r.id = %s
            """,
            (report_id,),
        )
        return cursor.fetchone()
    finally:
        safe_close_cursor(cursor)


def get_incoming_chat_notifications(username: str, db, since: Optional[str] = None):
    user_id = get_user_id(username, db)
    if not user_id:
        return []

    base_query = """
        SELECT m.id, u.username AS from_user, m.text, m.created_at
        FROM chat_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.receiver_id = %s AND m.sender_id <> %s
    """
    params = [user_id, user_id]

    if since:
        base_query += " AND m.created_at > %s"
        params.append(since)

    base_query += " ORDER BY m.created_at ASC LIMIT 50"

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(base_query, tuple(params))
        return cursor.fetchall() or []
    finally:
        safe_close_cursor(cursor)


# --- Authentication Endpoints ---
@app.post("/signup", response_model=AuthResponse)
def signup(user: UserSignUp):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    cursor = None
    try:
        cursor = db.cursor()
        hashed_password = bcrypt.hashpw(user.password.encode("utf-8"), bcrypt.gensalt())
        query = "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)"
        cursor.execute(query, (user.username, user.email, hashed_password.decode("utf-8")))
        db.commit()
        return {"status": "success", "message": "User created successfully!"}
    except DatabaseError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Username or email already exists")
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass


@app.post("/login", response_model=AuthResponse)
def login(user: UserLogin):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        query = "SELECT * FROM users WHERE username = %s"
        cursor.execute(query, (user.username,))
        db_user = cursor.fetchone()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    stored_password = db_user["password"] if db_user else None
    if isinstance(stored_password, str):
        stored_password = stored_password.encode("utf-8")

    if db_user and stored_password and bcrypt.checkpw(user.password.encode("utf-8"), stored_password):
        return {"status": "success", "message": "Login successful!", "username": db_user["username"]}
    else:
        raise HTTPException(status_code=401, detail="Invalid username or password")


# --- Chat Message Endpoints ---
@app.post("/send_message", response_model=FeedResponse)
def send_message(msg: Message):
    """
    Behavior:
    - If message is classified 'toxic' -> BLOCK (do not save), return notification.
    - If 'clean' -> save message with status 'approved', optionally bot reply and return feed.
    """
    label, prob = classify_text(msg.text)
    notification = None

    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    try:
        sender_id = get_user_id(msg.user, db)

        receiver_id = get_user_id(msg.receiver_username, db)
        if not receiver_id and msg.receiver_username == "Dana":
            cursor = None
            try:
                cursor = db.cursor()
                hashed_password = bcrypt.hashpw(b"bot_password", bcrypt.gensalt())
                cursor.execute(
                    "INSERT INTO users (username, email, password) VALUES (%s, %s, %s) ON CONFLICT (username) DO NOTHING RETURNING id",
                    ("Dana", "dana@bot.com", hashed_password.decode("utf-8")),
                )
                created = cursor.fetchone()
                db.commit()
                receiver_id = created[0] if created else get_user_id("Dana", db)
            finally:
                safe_close_cursor(cursor)

        if not sender_id or not receiver_id:
            raise HTTPException(status_code=404, detail="Sender or receiver not found")

        # If toxic -> do NOT save the message (blocked). Provide notification to user.
        if label == "toxic":
            notification = "Your message was blocked as it was detected as toxic."
            # Optionally, you could insert a moderation record (not the chat message)
            # e.g. INSERT INTO moderation_queue (user_id, target_id, text, reason, prob) ...
        else:
            # Save clean message
            cursor = None
            try:
                cursor = db.cursor()
                query = "INSERT INTO chat_messages (sender_id, receiver_id, text, status) VALUES (%s, %s, %s, %s)"
                cursor.execute(query, (sender_id, receiver_id, msg.text, "approved"))
                db.commit()
            finally:
                safe_close_cursor(cursor)

            # Optional bot reply logic (only when user chats with Dana)
            if msg.receiver_username == "Dana":
                bot_reply_text = f"You said: '{msg.text[:20]}...' Interesting!"
                cursor = None
                try:
                    cursor = db.cursor()
                    cursor.execute(
                        "INSERT INTO chat_messages (sender_id, receiver_id, text, status) VALUES (%s, %s, %s, %s)",
                        (receiver_id, sender_id, bot_reply_text, "approved"),
                    )
                    db.commit()
                finally:
                    safe_close_cursor(cursor)

    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        # we'll fetch feed below; keep DB connection until then
        pass

    # Build latest feed (even if message was blocked, the feed is returned)
    latest_feed = get_feed_internal(msg.user, db, msg.receiver_username)
    try:
        db.close()
    except Exception:
        pass

    return {"messages": latest_feed, "notification": notification}


def get_feed_internal(username: str, db, other_username: str = "Dana"):
    user_id = get_user_id(username, db)
    if not user_id:
        print(f"Could not find user_id for {username} in get_feed_internal")
        return []

    other_id = get_user_id(other_username, db)
    if not other_id and other_username == "Dana":
        cursor = None
        try:
            cursor = db.cursor()
            hashed_password = bcrypt.hashpw(b"bot_password", bcrypt.gensalt())
            cursor.execute(
                "INSERT INTO users (username, email, password) VALUES (%s, %s, %s) ON CONFLICT (username) DO NOTHING RETURNING id",
                ("Dana", "dana@bot.com", hashed_password.decode("utf-8")),
            )
            created = cursor.fetchone()
            db.commit()
            other_id = created[0] if created else get_user_id("Dana", db)
        except DatabaseError as e:
            print(f"Could not create bot user 'Dana': {e}")
            try:
                db.rollback()
            except Exception:
                pass
            other_id = None
        finally:
            safe_close_cursor(cursor)

    if not other_id:
        return []

    query = """
        SELECT m.id, m.text, m.status, m.created_at, u.username AS user
        FROM chat_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE (m.sender_id = %s AND m.receiver_id = %s) OR (m.sender_id = %s AND m.receiver_id = %s)
        ORDER BY m.created_at ASC
        LIMIT 40
    """

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(query, (user_id, other_id, other_id, user_id))
        messages = cursor.fetchall()
    finally:
        safe_close_cursor(cursor)

    return messages


@app.get("/get_feed/{username}", response_model=List[dict])
def get_feed(username: str, other_username: Optional[str] = None):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    messages = get_feed_internal(username, db, other_username or "Dana")
    try:
        db.close()
    except Exception:
        pass
    return messages


@app.get("/get_users/{username}", response_model=List[UserListItem])
def get_users(username: str):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    users = get_chat_usernames(username, db)
    try:
        db.close()
    except Exception:
        pass
    return users


@app.post("/typing_status", response_model=TypingStatusResponse)
def set_typing_status(payload: TypingStatusUpdate):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    sender_id = get_user_id(payload.user, db)
    receiver_id = get_user_id(payload.receiver_username, db)
    if not sender_id or not receiver_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Sender or receiver not found")

    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute(
            """
            INSERT INTO chat_typing_status (sender_id, receiver_id, is_typing, updated_at)
            VALUES (%s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (sender_id, receiver_id)
            DO UPDATE SET is_typing = EXCLUDED.is_typing, updated_at = CURRENT_TIMESTAMP
            """,
            (sender_id, receiver_id, payload.is_typing),
        )
        db.commit()
    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return {"username": payload.user, "is_typing": payload.is_typing}


@app.get("/typing_status/{username}", response_model=TypingStatusResponse)
def get_typing_status(username: str, other_username: str):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    current_user_id = get_user_id(username, db)
    other_user_id = get_user_id(other_username, db)
    if not current_user_id or not other_user_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="User not found")

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT is_typing, updated_at
            FROM chat_typing_status
            WHERE sender_id = %s AND receiver_id = %s
            """,
            (other_user_id, current_user_id),
        )
        row = cursor.fetchone()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    is_typing = False
    if row and row.get("is_typing"):
        updated_at = row.get("updated_at")
        if updated_at:
            is_typing = (datetime.utcnow() - updated_at.replace(tzinfo=None)).total_seconds() <= 6

    return {"username": other_username, "is_typing": is_typing}


@app.get("/chat_notifications/{username}", response_model=List[ChatNotificationItem])
def get_chat_notifications(username: str, since: Optional[str] = None):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    notifications = get_incoming_chat_notifications(username, db, since)
    try:
        db.close()
    except Exception:
        pass
    return notifications


@app.post("/report_message", response_model=MessageReportItem)
def report_message(payload: MessageReportCreate):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    reporter_id = get_user_id(payload.reporter_username, db)
    if not reporter_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Reporter not found")

    message = get_chat_message_by_id(payload.message_id, db)
    if not message:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="Message not found")

    if message["sender_id"] == reporter_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="You cannot report your own message")

    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute(
            """
            INSERT INTO message_reports (
                message_id, reporter_id, reported_user_id, reason, description
            ) VALUES (%s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                payload.message_id,
                reporter_id,
                message["sender_id"],
                payload.reason.strip(),
                payload.description.strip() if payload.description else None,
            ),
        )
        report_id = cursor.fetchone()[0]
        db.commit()
    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        if getattr(e, "pgcode", None) == "23505":
            raise HTTPException(status_code=400, detail="You have already reported this message")
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        safe_close_cursor(cursor)

    report_item = get_message_report_item(report_id, db)
    try:
        db.close()
    except Exception:
        pass
    if not report_item:
        raise HTTPException(status_code=500, detail="Report created but could not be loaded")
    return report_item


@app.get("/message_reports/pending", response_model=List[MessageReportItem])
def list_pending_message_reports():
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            """
            SELECT
                r.id AS report_id,
                r.message_id,
                r.reporter_id,
                reporter.username AS reporter_username,
                r.reported_user_id,
                reported.username AS reported_username,
                m.text AS message_text,
                r.reason,
                r.description,
                r.status,
                r.created_at,
                r.reviewed_by,
                r.reviewed_at
            FROM message_reports r
            JOIN users reporter ON reporter.id = r.reporter_id
            JOIN users reported ON reported.id = r.reported_user_id
            LEFT JOIN chat_messages m ON m.id = r.message_id
            WHERE r.status = 'pending'
            ORDER BY r.created_at DESC
            """
        )
        return cursor.fetchall() or []
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass


def _update_message_report_status(report_id: int, status: str, reviewed_by_username: Optional[str] = None):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    reviewed_by_id = None
    if reviewed_by_username:
        reviewed_by_id = get_user_id(reviewed_by_username, db)
        if not reviewed_by_id:
            try:
                db.close()
            except Exception:
                pass
            raise HTTPException(status_code=404, detail="Reviewer not found")

    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute(
            """
            UPDATE message_reports
            SET status = %s,
                reviewed_by = %s,
                reviewed_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (status, reviewed_by_id, report_id),
        )
        db.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Report not found")
    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return {"status": "success", "message": f"Report {status}"}


@app.post("/message_reports/{report_id}/resolve", response_model=ReportActionResponse)
def resolve_message_report(report_id: int, payload: ReportReviewPayload):
    return _update_message_report_status(report_id, "resolved", payload.reviewed_by_username)


@app.post("/message_reports/{report_id}/dismiss", response_model=ReportActionResponse)
def dismiss_message_report(report_id: int, payload: ReportReviewPayload):
    return _update_message_report_status(report_id, "dismissed", payload.reviewed_by_username)


# --- Create Database Tables (idempotent) ---
def create_tables():
    db = get_db_connection()
    if db is None:
        print("Could not connect to DB to create tables.")
        return
    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS posts (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL,
                text TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending', 'blocked')),
                parent_id INT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (parent_id) REFERENCES posts(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                id SERIAL PRIMARY KEY,
                user_id INT NOT NULL UNIQUE,
                bio TEXT,
                profile_image_url VARCHAR(255),
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                text TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'pending')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS message_reports (
                id SERIAL PRIMARY KEY,
                message_id INT NOT NULL,
                reporter_id INT NOT NULL,
                reported_user_id INT NOT NULL,
                reason VARCHAR(50) NOT NULL,
                description TEXT,
                status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
                reviewed_by INT NULL,
                reviewed_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (message_id, reporter_id),
                FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE,
                FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reported_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_typing_status (
                id SERIAL PRIMARY KEY,
                sender_id INT NOT NULL,
                receiver_id INT NOT NULL,
                is_typing BOOLEAN NOT NULL DEFAULT FALSE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (sender_id, receiver_id),
                FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_message_reports_reporter ON message_reports(reporter_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_message_reports_reported ON message_reports(reported_user_id)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_message_reports_status ON message_reports(status)")
        cursor.execute(
            """
            CREATE OR REPLACE VIEW v_pending_reports AS
            SELECT
                r.id AS report_id,
                r.message_id,
                r.reporter_id,
                reporter.username AS reporter_username,
                r.reported_user_id,
                reported.username AS reported_username,
                m.text AS message_content,
                r.reason,
                r.description,
                r.status,
                r.created_at
            FROM message_reports r
            JOIN users reporter ON reporter.id = r.reporter_id
            JOIN users reported ON reported.id = r.reported_user_id
            LEFT JOIN chat_messages m ON m.id = r.message_id
            WHERE r.status = 'pending'
            ORDER BY r.created_at DESC
            """
        )
        db.commit()
        print("Tables (posts, user_profiles, chat_messages, message_reports) checked/created successfully.")
    except DatabaseError as e:
        print(f"Error creating tables: {e}")
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

create_tables()


# --- Post & Comment Endpoints ---
@app.post("/create_post", response_model=PostResponse)
def create_post(post: NewPost):
    label, prob = classify_text(post.text)
    status = "pending" if label == "toxic" else "approved"
    notification = None
    if label == "toxic":
        if post.parent_id:
            notification = f"Comment from '{post.user}' is toxic ⚠️, waiting approval"
        else:
            notification = f"Post from '{post.user}' is toxic ⚠️, waiting approval"

    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    user_id = get_user_id(post.user, db)
    if not user_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="User not found")

    new_post_id = None
    cursor = None
    try:
        cursor = db.cursor()
        query = "INSERT INTO posts (user_id, text, status, parent_id) VALUES (%s, %s, %s, %s) RETURNING id"
        cursor.execute(query, (user_id, post.text, status, post.parent_id))
        new_post_id = cursor.fetchone()[0]
        db.commit()
    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Database error during insert: {e}")
    finally:
        safe_close_cursor(cursor)

    created_post = None
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(
            "SELECT p.id, p.text, p.status, p.created_at, p.parent_id, u.username "
            "FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = %s",
            (new_post_id,),
        )
        created_post = cursor.fetchone()
    except Exception as e:
        print(f"[create_post] Warning: failed to fetch created post: {e}")
        created_post = {
            "id": new_post_id,
            "text": post.text,
            "status": status,
            "created_at": datetime.utcnow().isoformat(),
            "parent_id": post.parent_id,
            "username": post.user,
        }
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return {"post": created_post, "notification": notification}


@app.get("/get_posts", response_model=List[dict])
def get_posts():
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    query = """
        SELECT p.id, p.text, p.status, p.created_at, p.parent_id, u.username
        FROM posts p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
    """
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(query)
        all_posts_and_comments = cursor.fetchall()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    posts_dict = {item["id"]: {**item, "comments": []} for item in all_posts_and_comments if item["parent_id"] is None}
    for item in all_posts_and_comments:
        if item["parent_id"] is not None:
            parent = posts_dict.get(item["parent_id"])
            if parent:
                parent["comments"].append(item)

    return list(posts_dict.values())


@app.post("/approve_post/{post_id}", response_model=dict)
def approve_post(post_id: int):
    db = get_db_connection()
    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute("UPDATE posts SET status = 'approved' WHERE id = %s", (post_id,))
        db.commit()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass
    return {"status": "success", "message": "Post approved"}


@app.post("/block_post/{post_id}", response_model=dict)
def block_post(post_id: int):
    db = get_db_connection()
    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute("UPDATE posts SET status = 'blocked' WHERE id = %s", (post_id,))
        db.commit()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass
    return {"status": "success", "message": "Post blocked"}


@app.post("/delete_post/{post_id}", response_model=dict)
def delete_post(post_id: int):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute("DELETE FROM posts WHERE id = %s", (post_id,))
        db.commit()
        affected = cursor.rowcount
    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    if affected == 0:
        raise HTTPException(status_code=404, detail="Post not found")

    return {"status": "success", "message": "Post deleted"}


# --- Profile Endpoints ---
@app.get("/get_profile/{username}", response_model=ProfileData)
def get_profile(username: str):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    user_id = get_user_id(username, db)
    if not user_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="User not found")

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute("SELECT id, username, email FROM users WHERE id = %s", (user_id,))
        user_data_full = cursor.fetchone()

        cursor.execute("SELECT bio, profile_image_url FROM user_profiles WHERE user_id = %s", (user_data_full["id"],))
        profile_data = cursor.fetchone()

        if not profile_data:
            default_bio = "Welcome to my SafeChat profile!"
            cursor.execute("INSERT INTO user_profiles (user_id, bio) VALUES (%s, %s)", (user_data_full["id"], default_bio))
            db.commit()
            profile_data = {"bio": default_bio, "profile_image_url": None}
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return ProfileData(**user_data_full, **profile_data)


@app.post("/upload_image/{username}")
async def upload_image(username: str, file: UploadFile = File(...)):
    filename = f"{username}_{file.filename}"
    file_path = os.path.join(UPLOADS_DIR, filename)

    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save file: {e}")
    finally:
        try:
            file.file.close()
        except Exception:
            pass

    return {"file_url": f"/{UPLOADS_DIR}/{filename}"}


@app.post("/update_profile/{username}", response_model=ProfileData)
def update_profile(username: str, profile: ProfileUpdate):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    user_id = get_user_id(username, db)
    if not user_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="User not found")

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        query = """
            INSERT INTO user_profiles (user_id, bio, profile_image_url)
            VALUES (%s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET
                bio = EXCLUDED.bio,
                profile_image_url = EXCLUDED.profile_image_url,
                updated_at = CURRENT_TIMESTAMP
        """
        cursor.execute(query, (user_id, profile.bio, profile.profile_image_url))
        db.commit()
    finally:
        safe_close_cursor(cursor)

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute("""
            SELECT u.username, u.email, up.bio, up.profile_image_url
            FROM users u
            LEFT JOIN user_profiles up ON u.id = up.user_id
            WHERE u.id = %s
        """, (user_id,))
        updated_data = cursor.fetchone()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return ProfileData(**updated_data)


# --- Chat Message Moderation Endpoints ---
@app.post("/update_chat_message_status/{message_id}", response_model=dict)
def update_chat_message_status(message_id: int, status: str):
    """Update the moderation status of a chat message."""
    if status not in ("approved", "blocked"):
        raise HTTPException(status_code=400, detail="Status must be 'approved' or 'blocked'")

    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    cursor = None
    try:
        cursor = db.cursor()
        cursor.execute("UPDATE chat_messages SET status = %s WHERE id = %s", (status, message_id))
        db.commit()
        affected = cursor.rowcount
    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    if affected == 0:
        raise HTTPException(status_code=404, detail="Chat message not found")

    return {"status": "success", "message": f"Chat message {status}"}


# --- Post History Endpoint ---
@app.get("/get_user_post_history/{username}", response_model=List[dict])
def get_user_post_history(username: str):
    """Get all posts and comments by a specific user."""
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    user_id = get_user_id(username, db)
    if not user_id:
        try:
            db.close()
        except Exception:
            pass
        raise HTTPException(status_code=404, detail="User not found")

    query = """
        SELECT p.id, p.text, p.status, p.created_at, p.parent_id, u.username
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.user_id = %s
        ORDER BY p.created_at DESC
    """
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(query, (user_id,))
        posts = cursor.fetchall()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return posts


# --- Post Moderation Endpoints ---
@app.get("/get_reported_posts", response_model=List[ReportedPost])
def get_reported_posts():
    """Get posts that have been flagged for review."""
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    query = """
        SELECT p.id, p.post_id, p.text, p.created_at, u.username
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.status = 'flag'
        ORDER BY p.created_at DESC
    """
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(query)
        posts = [ReportedPost(**row) for row in cursor.fetchall()]
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return posts


@app.post("/update_post_status/{post_id}", response_model=PostResponse)
def update_post_status(post_id: int, status: str):
    """Update the moderation status of a post (approve/reject/remove)."""
    if status not in ("approved", "flagged", "removed"):
        raise HTTPException(status_code=400, detail="Status must be 'approved', 'flagged', or 'removed'")

    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute("UPDATE posts SET status = %s WHERE id = %s", (status, post_id))
        db.commit()

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Post not found")

        # Fetch updated post
        cursor.execute("""
            SELECT p.id, p.text, p.status, p.created_at, u.username
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE p.id = %s
        """, (post_id,))
        updated_post = cursor.fetchone()
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return PostResponse(**updated_post)


# --- User Management Endpoints ---
class UserSummary(BaseModel):
    id: int
    username: str
    email: str
    created_at: Optional[datetime] = None
    post_count: int = 0
    flag_count: int = 0


@app.get("/get_users", response_model=List[UserSummary])
def get_users():
    """Get all users with their activity stats."""
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    query = """
        SELECT u.id, u.username, u.email, u.created_at,
               COUNT(DISTINCT p.id) as post_count,
               COUNT(DISTINCT CASE WHEN p.status IN ('flag', 'spam') THEN p.id END) as flag_count
        FROM users u
        LEFT JOIN posts p ON u.id = p.user_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
    """
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)
        cursor.execute(query)
        users = [UserSummary(**row) for row in cursor.fetchall()]
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return users


# --- Bulk Moderation Endpoint ---
class BulkModerationRequest(BaseModel):
    action: str  # "approve", "reject", "delete"
    item_ids: List[int]
    item_type: str = "post"  # "post" or "comment"


@app.post("/bulk_moderation", response_model=dict)
def bulk_moderate(request: BulkModerationRequest):
    """Perform moderation actions on multiple items at once."""
    if not request.item_ids:
        raise HTTPException(status_code=400, detail="No item IDs provided")

    action_map = {
        "approve": "approved",
        "reject": "rejected",
        "delete": "deleted"
    }

    if request.action not in action_map:
        raise HTTPException(status_code=400, detail="Invalid action")

    status_value = action_map[request.action]

    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    cursor = None
    try:
        cursor = db.cursor()
        placeholders = ','.join(['%s'] * len(request.item_ids))

        if request.item_type == "post":
            query = f"UPDATE posts SET status = %s WHERE id IN ({placeholders})"
        elif request.item_type == "comment":
            query = f"UPDATE posts SET status = %s WHERE id IN ({placeholders}) AND parent_id IS NOT NULL"
        else:
            raise HTTPException(status_code=400, detail="Invalid item type")

        cursor.execute(query, [status_value] + request.item_ids)
        db.commit()
        updated_count = cursor.rowcount
    except HTTPException:
        raise
    except DatabaseError as e:
        try:
            db.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Database error: {e}")
    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return {
        "status": "success",
        "updated_count": updated_count,
        "requested_count": len(request.item_ids)
    }


# --- Moderation Stats ---
class ModerationStats(BaseModel):
    total_posts: int = 0
    pending_review: int = 0
    approved: int = 0
    flagged: int = 0
    removed: int = 0
    total_users: int = 0
    active_today: int = 0


@app.get("/moderation_stats", response_model=ModerationStats)
def get_moderation_stats():
    """Get dashboard statistics for content moderation."""
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")

    stats = {}
    cursor = None
    try:
        cursor = db.cursor(dictionary=True)

        cursor.execute("SELECT COUNT(*) as total_posts FROM posts")
        stats["total_posts"] = cursor.fetchone()["total_posts"]

        cursor.execute("SELECT COUNT(*) as pending FROM posts WHERE status = 'flag'")
        stats["pending_review"] = cursor.fetchone()["pending"]

        cursor.execute("SELECT COUNT(*) as approved FROM posts WHERE status = 'approved'")
        stats["approved"] = cursor.fetchone()["approved"]

        cursor.execute("SELECT COUNT(*) as flagged FROM posts WHERE status IN ('spam', 'toxic')")
        stats["flagged"] = cursor.fetchone()["flagged"]

        cursor.execute("SELECT COUNT(*) as removed FROM posts WHERE status = 'removed'")
        stats["removed"] = cursor.fetchone()["removed"]

        cursor.execute("SELECT COUNT(*) as total_users FROM users")
        stats["total_users"] = cursor.fetchone()["total_users"]

        cursor.execute("""
            SELECT COUNT(DISTINCT user_id) as active FROM posts
            WHERE created_at >= CURRENT_DATE
        """)
        stats["active_today"] = cursor.fetchone()["active"]

    finally:
        safe_close_cursor(cursor)
        try:
            db.close()
        except Exception:
            pass

    return ModerationStats(**stats)


# --- End of File ---
