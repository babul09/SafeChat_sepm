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

class ProfileUpdate(BaseModel):
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None

class ProfileData(BaseModel):
    username: str
    email: str
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None


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
        cursor.execute(query, (user.username, user.email, hashed_password))
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

    if db_user and bcrypt.checkpw(user.password.encode("utf-8"), db_user["password"].encode("utf-8")):
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

            # Optional bot reply logic (bot replies only when user's message is saved)
            bot_reply_text = f"You said: '{msg.text[:20]}...' Interesting!"
            cursor = None
            try:
                cursor = db.cursor()
                # Bot sends a reply back to the user (swap sender/receiver)
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
    latest_feed = get_feed_internal(msg.user, db)
    try:
        db.close()
    except Exception:
        pass

    return {"messages": latest_feed, "notification": notification}


def get_feed_internal(username: str, db):
    user_id = get_user_id(username, db)
    if not user_id:
        print(f"Could not find user_id for {username} in get_feed_internal")
        return []

    # Ensure bot exists (Dana)
    bot_id = get_user_id("Dana", db)
    if not bot_id:
        cursor = None
        try:
            cursor = db.cursor()
            hashed_password = bcrypt.hashpw(b"bot_password", bcrypt.gensalt())
            cursor.execute("INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
                           ("Dana", "dana@bot.com", hashed_password))
            db.commit()
            bot_id = cursor.lastrowid
            safe_close_cursor(cursor)
            print("Created 'Dana' bot user.")
        except DatabaseError as e:
            print(f"Could not create bot user 'Dana': {e}")
            try:
                db.rollback()
            except Exception:
                pass
            safe_close_cursor(cursor)
            bot_id = user_id  # fallback

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
        cursor.execute(query, (user_id, bot_id, bot_id, user_id))
        messages = cursor.fetchall()
    finally:
        safe_close_cursor(cursor)

    return messages


@app.get("/get_feed/{username}", response_model=List[dict])
def get_feed(username: str):
    db = get_db_connection()
    if db is None:
        raise HTTPException(status_code=500, detail="Database connection failed")
    messages = get_feed_internal(username, db)
    try:
        db.close()
    except Exception:
        pass
    return messages


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
        db.commit()
        print("Tables (posts, user_profiles, chat_messages) checked/created successfully.")
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
        cursor = db.cursor(dictionary=True)
        query = "INSERT INTO posts (user_id, text, status, parent_id) VALUES (%s, %s, %s, %s)"
        cursor.execute(query, (user_id, post.text, status, post.parent_id))
        db.commit()
        new_post_id = cursor.lastrowid
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
            ON DUPLICATE KEY UPDATE
                bio = VALUES(bio),
                profile_image_url = VALUES(profile_image_url)
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

# --- End of File ---
