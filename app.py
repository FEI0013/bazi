from datetime import timedelta
from flask import Flask, request, jsonify, session
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix
import os

# ===== Flask 后端：只提供 /api/* 三个接口 =====
# 不影响你现有前端/Node 逻辑
# 运行：python app.py  （默认 127.0.0.1:5000）

app = Flask(__name__)

# 识别反向代理的协议与主机（Node/Cloudflare/Nginx）
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# 建议用环境变量覆盖（生产更安全）
app.secret_key = os.getenv("APP_SECRET", "CHANGE_THIS_TO_A_LONG_RANDOM_SECRET")
app.config.update(
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
    # 同域代理用 Lax；如跨子域（api. 与 bazi.）请改为 None 并配合 SESSION_COOKIE_SECURE=1
    SESSION_COOKIE_SAMESITE=os.getenv("SESSION_SAMESITE", "Lax"),
    # 线上 HTTPS 建议设为 1；本地开发保持 0
    SESSION_COOKIE_SECURE=os.getenv("SESSION_SECURE", "0") == "1",
)

# 同域代理时可不需要 CORS；保留开启便于开发/排错
CORS(app, supports_credentials=True)

# 简单账号（可用环境变量覆盖，或改成数据库校验）
VALID_USER = os.getenv("LOGIN_USER", "admin")
VALID_PASS = os.getenv("LOGIN_PASS", "123456")


@app.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    if username == VALID_USER and password == VALID_PASS:
        session.permanent = True
        session["user"] = username
        return jsonify({"success": True, "username": username})
    return jsonify({"success": False, "message": "账号或密码不正确"}), 401


@app.post("/api/logout")
def logout():
    session.pop("user", None)
    return jsonify({"success": True})


@app.get("/api/check_login")
def check_login():
    user = session.get("user")
    return jsonify({"logged_in": bool(user), "username": user})


if __name__ == "__main__":
    # 生产请用 gunicorn/waitress 等；这里仅开发使用
    app.run(host="127.0.0.1", port=5000, debug=True)


# === 兼容无前缀访问（临时或长期都可） ===
@app.get("/check_login")
def check_login_alias():
    return check_login()

@app.post("/login")
def login_alias():
    return login()

@app.post("/logout")
def logout_alias():
    return logout()
