import os
import re
import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .db import get_db
from .models import User

SECRET = os.getenv('JWT_SECRET', 'local-fitspot-development-secret-change-before-deploy')
ALGORITHM = 'HS256'
security = HTTPBearer(auto_error=False)

def validate_email(email: str) -> str:
    value = email.strip().lower()
    if len(value) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', value):
        raise HTTPException(422, 'Укажите корректный email')
    return value

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 310_000)
    return 'pbkdf2_sha256$310000$' + base64.b64encode(salt).decode() + '$' + base64.b64encode(digest).decode()

def verify_password(password: str, stored: str) -> bool:
    try:
        method, count, salt, expected = stored.split('$')
        if method != 'pbkdf2_sha256':
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), base64.b64decode(salt), int(count))
        return hmac.compare_digest(actual, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False

def issue_token(user: User) -> str:
    payload = {'sub': str(user.id), 'exp': datetime.now(timezone.utc) + timedelta(days=7)}
    return jwt.encode(payload, SECRET, algorithm=ALGORITHM)

def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Войдите в аккаунт')
    try:
        payload = jwt.decode(credentials.credentials, SECRET, algorithms=[ALGORITHM])
        user_id = int(payload['sub'])
    except (jwt.PyJWTError, ValueError, KeyError, TypeError):
        raise HTTPException(401, 'Сессия истекла, войдите снова')
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(401, 'Пользователь не найден')
    return user
