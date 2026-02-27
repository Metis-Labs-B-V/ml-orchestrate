from enum import Enum


class ApiStatus(str, Enum):
    SUCCESS = "success"
    ERROR = "error"
