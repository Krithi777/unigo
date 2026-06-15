# Pydantic: CommunityCreate, CommunityJoin, CommunityOut

from pydantic import BaseModel


class CommunityCreate(BaseModel):
    name: str
    description: str | None = None


class CommunityJoin(BaseModel):
    community_id: int


class CommunityOut(BaseModel):
    id: int
    name: str
    description: str | None = None