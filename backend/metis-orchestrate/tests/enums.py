from dotenv import load_dotenv
from enum import Enum
import os
load_dotenv()
base_url = os.getenv("BACKEND_URL")

class HTTPMethod(Enum):
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"