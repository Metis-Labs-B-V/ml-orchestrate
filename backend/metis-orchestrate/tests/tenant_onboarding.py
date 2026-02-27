import random
from api_call import api_call
from enums import HTTPMethod

class TenantOnboarding():
    superuser_token = None
    email = None
    email2 = None
    password = "India@123456"
    
    random_valid_email = "random@example.com"
    invalid_email = "invalid-email"
    missing_email = None
    missing_password = None

    password_lt12 = "India@123"
    password_gt_64 = "India@" + "a"*60 + "123456"
    password_no_upper = "india@123456"
    password_no_lower = "INDIA@123456"
    password_no_digit = "India@abcdef"
    password_no_special = "India1234567"

    test_case = []



    def __init__(self, superuser_token):
        self.email = f"test__tenant_{random.randint(1000,99999)}@example.com"
        self.email2 = f"test__tenant_{random.randint(1000,99999)}@example.com"
        self.superuser_token = superuser_token



    def create_test_case(self, name, payload, response, message, result):
        case = {}
        case["name"] = name
        case["payload"] = payload
        case["response"] = response
        case["message"] = message
        case["result"] = result
        self.test_case.append(case)



    def create_payload(self, name, email, password):
        return {
            "tenant": {
                "name": name,
            },
            "owner": {
                "email": email,
                "first_name": f"{random.randint(1000,99999)}_firstname",
                "password": password,
                "last_name": f"{random.randint(1000,99999)}_lastname",
            }
        }

    
    def signup_tenant(self, email, password, case_name, expected_message):
        try:
            url = "/api/v1/auth/onboard/"

            data = self.create_payload(
                name=f"{random.randint(1000,9999)}_tenant",
                email=email,
                password=password
            )

            response = api_call(
                url=url, 
                method=HTTPMethod.POST.value, 
                data=data,
                auth_token=self.superuser_token
            )
            
            self.create_test_case(
                name=case_name,
                payload=data,
                response=response,
                message = response.get("message"),
                result="Passed" if response.get("message") == expected_message else "Failed"
            )
            # print(f"{case_name}: {'Passed' if response.get('message') == expected_message else 'Failed'}")
            # print(response.get("message"))
            # print("--------------------------------------------------")

        except Exception as e:
            print(f"❌ Error signing up tenant: {e}")



    def start_test(self):
        print("✅ Starting Tenant Onboarding Test")

        self.signup_tenant(self.email, self.password, case_name="Valid Signup", expected_message="Tenant onboarded")
        self.signup_tenant(self.missing_email, self.password, case_name="Email Required", expected_message="Email is required.")
        self.signup_tenant(self.invalid_email, self.password, case_name="Invalid Email", expected_message="Enter a valid email address.")
        self.signup_tenant(self.email, self.password, case_name="Duplicate Email", expected_message="Email already registered.")
        self.signup_tenant(self.random_valid_email, self.missing_password, case_name="Password Required", expected_message="Password is required.")
        
        self.signup_tenant(self.random_valid_email, self.password_lt12, case_name="Password Length < 12", expected_message="Password must be at least 12 characters long.")
        self.signup_tenant(self.random_valid_email, self.password_gt_64, case_name="Password Length > 64", expected_message="Password cannot exceed 64 characters.")
        self.signup_tenant(self.random_valid_email, self.password_no_upper, case_name="Password No Uppercase", expected_message="Password must contain at least one uppercase letter.")
        self.signup_tenant(self.random_valid_email, self.password_no_lower, case_name="Password No Lowercase", expected_message="Password must contain at least one lowercase letter.")
        self.signup_tenant(self.random_valid_email, self.password_no_digit, case_name="Password No Digit", expected_message="Password must contain at least one number.")

        self.signup_tenant(self.email2, self.password, case_name="Valid Signup", expected_message="Tenant onboarded")

        tenant_details = [
            {
                "email": self.email,
                "password": self.password
            },
            {
                "email": self.email2,
                "password": self.password
            }
        ]

        return self.test_case, tenant_details