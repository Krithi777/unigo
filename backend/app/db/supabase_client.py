from supabase import create_client, Client
from app.core.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

print("URL =", SUPABASE_URL)
print("KEY starts with =", SUPABASE_SERVICE_ROLE_KEY[:20])

supabase: Client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)