from api_call import api_call
from enums import HTTPMethod

def get_superuser_token():
    username = "admin@admin.com"
    password = "India@123456"
    url = "/api/v1/auth/login/"
    data = {"email": username,"password": password}
    
    response = api_call(
        url=url, 
        method=HTTPMethod.POST.value, 
        data=data, 
        auth_token=None
    )

    auth_token = response.get("data").get("access")
    print("✅ Superuser Token Generated")
    return auth_token


