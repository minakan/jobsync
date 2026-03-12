from fastapi import APIRouter

from app.api.v1 import auth, companies, emails, inbound, schedules, users

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(emails.router, prefix="/emails", tags=["emails"])
api_router.include_router(inbound.router, prefix="/emails/inbound", tags=["inbound"])
api_router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
api_router.include_router(companies.router, prefix="/companies", tags=["companies"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
