from flask import Flask, render_template, request, redirect, session, url_for
import sqlite3
import os
import uuid

# moviepy is used to inspect video duration; install with `pip install moviepy`
from moviepy import VideoFileClip

app = Flask(__name__)
app.secret_key = "shunya_secret"


# ======================
# Upload folder
# ======================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

UPLOAD_FOLDER = os.path.join(BASE_DIR, "static", "uploads")

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER


# ======================
# Database
# ======================

def init_db():
    conn = sqlite3.connect("database.db")
    c = conn.cursor()

    # Check if projects table exists
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'")
    table_exists = c.fetchone()

    if table_exists:
        # Table exists, check its structure
        c.execute("PRAGMA table_info(projects)")
        cols = {row[1]: row[2] for row in c.fetchall()}  # {column_name: type}

        # If old 'image' column exists but not 'filename', migrate
        if 'image' in cols and 'filename' not in cols:
            # Rename image to filename
            c.execute("ALTER TABLE projects RENAME COLUMN image TO filename")

        # Migrate media_type to filetype if needed
        if 'media_type' in cols and 'filetype' not in cols:
            # Copy data from media_type to filetype
            c.execute("ALTER TABLE projects ADD COLUMN filetype TEXT DEFAULT 'image'")
            c.execute("UPDATE projects SET filetype = media_type WHERE media_type IS NOT NULL")
        elif 'filetype' not in cols:
            # Just add filetype column
            c.execute("ALTER TABLE projects ADD COLUMN filetype TEXT DEFAULT 'image'")

        # Add created_at column if missing
        if 'created_at' not in cols:
            c.execute("ALTER TABLE projects ADD COLUMN created_at TIMESTAMP")
    else:
        # Create new table with correct schema
        c.execute("""
        CREATE TABLE IF NOT EXISTS projects(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            filename TEXT,
            filetype TEXT DEFAULT 'image',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)

    # Create likes table
    c.execute("""
    CREATE TABLE IF NOT EXISTS likes(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        user_ip TEXT,
        UNIQUE(project_id, user_ip),
        FOREIGN KEY(project_id) REFERENCES projects(id)
    )
    """)

    conn.commit()
    conn.close()


# allowed file extensions and helper
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm'}

def allowed_file(filename):
    ext = os.path.splitext(filename)[1].lower()
    return ext in IMAGE_EXTENSIONS or ext in VIDEO_EXTENSIONS


# ======================
# Home Page
# ======================

@app.route("/")
def home():

    conn = sqlite3.connect("database.db")
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    projects = c.execute("SELECT * FROM projects ORDER BY id DESC").fetchall()
    
    # get likes count for each project
    projects_with_likes = []
    user_ip = request.remote_addr
    
    for project in projects:
        likes = c.execute("SELECT COUNT(*) FROM likes WHERE project_id = ?", (project['id'],)).fetchone()[0]
        user_liked = c.execute("SELECT COUNT(*) FROM likes WHERE project_id = ? AND user_ip = ?", (project['id'], user_ip)).fetchone()[0] > 0
        projects_with_likes.append({
            'id': project['id'],
            'title': project['title'],
            'filename': project['filename'],
            # fallback to 'image' if somehow the column doesn't exist or is null
            'filetype': project['filetype'] if project['filetype'] else 'image',
            'likes': likes,
            'user_liked': user_liked
        })

    conn.close()

    is_admin = session.get("admin", False)
    return render_template("index.html", projects=projects_with_likes, is_admin=is_admin)


# ======================
# Login Page
# ======================

@app.route("/login", methods=["GET","POST"])
def login():

    if request.method == "POST":

        username = request.form["username"]
        password = request.form["password"]

        # changed password per user request
        if username == "admin" and password == "shivam123":

            session["admin"] = True
            # after successful login redirect to home page (main page)
            return redirect(url_for("home"))

    return render_template("login.html")


# ======================
# Delete Project (Admin Only)
# ======================

@app.route("/delete/<int:project_id>")
def delete_project(project_id):

    if not session.get("admin"):
        return redirect(url_for("login"))

    conn = sqlite3.connect("database.db")
    c = conn.cursor()

    # get project to delete image file
    project = c.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()

    if project:
        # delete image file
        image_path = os.path.join(app.config["UPLOAD_FOLDER"], project[2])
        if os.path.exists(image_path):
            os.remove(image_path)

        # delete from database
        c.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()

    conn.close()

    return redirect(url_for("home"))


# ======================
# Like Project API
# ======================

@app.route("/api/like/<int:project_id>", methods=["POST"])
def like_project(project_id):

    user_ip = request.remote_addr
    conn = sqlite3.connect("database.db")
    c = conn.cursor()

    # check if user already liked
    existing = c.execute("SELECT * FROM likes WHERE project_id = ? AND user_ip = ?", (project_id, user_ip)).fetchone()

    if existing:
        # unlike
        c.execute("DELETE FROM likes WHERE project_id = ? AND user_ip = ?", (project_id, user_ip))
        liked = False
    else:
        # like
        c.execute("INSERT INTO likes(project_id, user_ip) VALUES(?, ?)", (project_id, user_ip))
        liked = True

    conn.commit()

    # get new like count
    likes = c.execute("SELECT COUNT(*) FROM likes WHERE project_id = ?", (project_id,)).fetchone()[0]

    conn.close()

    return {"liked": liked, "likes": likes}


# ======================
# Logout
# ======================

@app.route("/logout")
def logout():

    session.pop("admin", None)

    return redirect(url_for("home"))


# ======================
# Upload Project
# ======================

@app.route("/upload", methods=["POST"])
def upload():

    if not session.get("admin"):
        return redirect(url_for("login"))

    title = request.form.get("title", "").strip()
    media = request.files.get("media")

    if not title or not media:
        return redirect(url_for("home"))

    filename = media.filename
    if not allowed_file(filename):
        return "Unsupported file type", 400

    ext = os.path.splitext(filename)[1].lower()
    filetype = 'video' if ext in VIDEO_EXTENSIONS else 'image'

    # if video, validate duration
    if filetype == 'video':
        tmpname = os.path.join(app.config["UPLOAD_FOLDER"], "tmp_" + str(uuid.uuid4()) + ext)
        media.save(tmpname)
        try:
            clip = VideoFileClip(tmpname)
            duration = clip.duration
            clip.close()
        except Exception:
            if os.path.exists(tmpname):
                os.remove(tmpname)
            return "Could not process video", 400

        if duration < 5 or duration > 300:
            os.remove(tmpname)
            return "Video must be between 5 seconds and 5 minutes", 400

        unique_name = str(uuid.uuid4()) + ext
        final_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
        os.rename(tmpname, final_path)
        filename = unique_name
    else:
        unique_name = str(uuid.uuid4()) + ext
        final_path = os.path.join(app.config["UPLOAD_FOLDER"], unique_name)
        media.save(final_path)
        filename = unique_name

    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    # Use CURRENT_TIMESTAMP directly in SQL (works in INSERT but not in ALTER TABLE)
    c.execute(
        "INSERT INTO projects(title,filename,filetype,created_at) VALUES(?,?,?,CURRENT_TIMESTAMP)",
        (title, filename, filetype)
    )
    conn.commit()
    conn.close()

    return redirect(url_for("home"))


# ======================
# Start server
# ======================

if __name__ == "__main__":

    init_db()

    app.run(debug=True)