from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.user import UserFcmTokenUpdate, UserResponse

router = APIRouter()


@router.patch("/me/fcm-token", response_model=UserResponse)
async def update_my_fcm_token(
    payload: UserFcmTokenUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserResponse:
    current_user.fcm_token = payload.fcm_token
    db.add(current_user)
    await db.flush()
    return UserResponse.model_validate(current_user)
