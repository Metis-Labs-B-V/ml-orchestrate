import requests
from enums import base_url, HTTPMethod


def api_call(url, method, data, auth_token):

    headers = {"Content-Type": "application/json"}

    if auth_token:
        headers["Authorization"] = f"Bearer {auth_token}"

    url = f"{base_url}{url}"
    
    if method == HTTPMethod.GET.value:
        response = requests.get(url, headers=headers)
    elif method == HTTPMethod.POST.value:
        response = requests.post(url, json=data, headers=headers)
    elif method == HTTPMethod.PUT.value:
        response = requests.put(url, json=data, headers=headers)
    elif method == HTTPMethod.DELETE.value:
        response = requests.delete(url, headers=headers)
    else:
        raise ValueError("Invalid HTTP method")

    try:
        return response.json()
    except ValueError:
        return {
            "status": "error",
            "message": f"Non-JSON response ({response.status_code})",
            "data": None,
            "errors": {"raw_response": (response.text or "")[:300]},
        }
