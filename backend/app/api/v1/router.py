from fastapi import APIRouter

api_router = APIRouter()

# 各サービスのルーターは実装後にここで include する
# from app.api.v1 import auth, emails, schedules, companies
# api_router.include_router(auth.router,      prefix="/auth",      tags=["auth"])
# api_router.include_router(emails.router,    prefix="/emails",    tags=["emails"])
# api_router.include_router(schedules.router, prefix="/schedules", tags=["schedules"])
# api_router.include_router(companies.router, prefix="/companies", tags=["companies"])
