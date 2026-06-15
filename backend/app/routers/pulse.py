# GET  /pulse/today
# POST /pulse/checkin
# GET  /pulse/community/{community_id}
from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def get_pulse():
    return {"message": "Pulse router working"}