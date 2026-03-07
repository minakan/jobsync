from fastapi import APIRouter

from app.api.v1 import companies, emails, schedules, users

api_router = APIRouter()

api_router.include_router(emails.router, prefix="/emails", tags=["emails"])
api_router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
api_router.include_router(companies.router, prefix="/companies", tags=["companies"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
