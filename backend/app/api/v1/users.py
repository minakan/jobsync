from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.forwarding import generate_forwarding_address
from app.core.security import get_current_user
from app.models.user import User
from app.schemas.user import (
    UserFcmTokenUpdate,
    UserForwardingAddressResponse,
    UserResponse,
)

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_my_profile(
    current_user: Annotated[User, Depends(get_current_user)],
) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.patch("/me/fcm-token", status_code=204)
async def update_my_fcm_token(
    payload: UserFcmTokenUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    current_user.fcm_token = payload.fcm_token
    db.add(current_user)
    await db.commit()


@router.get("/me/forwarding-address", response_model=UserForwardingAddressResponse)
async def get_my_forwarding_address(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserForwardingAddressResponse:
    if current_user.forwarding_email is not None:
        return UserForwardingAddressResponse(
            forwarding_email=current_user.forwarding_email
        )

    forwarding_email = generate_forwarding_address(settings.FORWARDING_EMAIL_DOMAIN)
    current_user.forwarding_email = forwarding_email
    db.add(current_user)
    await db.flush()

    return UserForwardingAddressResponse(forwarding_email=forwarding_email)
