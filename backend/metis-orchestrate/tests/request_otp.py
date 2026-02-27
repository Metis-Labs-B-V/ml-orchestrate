# email.split('@')[0]}_VERIFICATION_LINK

import random
from api_call import api_call
from enums import HTTPMethod

class RequestOTP():
    email = None
    email2 = None
    password = None

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
    incorrect_password = "Incorrect@123456"

    test_case = []




    def __init__(self, email, email2, password):
        self.email = email
        self.email2 = email2
        self.password = password

    def create_test_case(self, name, payload, response, message, result):
        case = {}
        case["name"] = name
        case["payload"] = payload
        case["response"] = response
        case["message"] = message
        case["result"] = result
        self.test_case.append(case)



    def create_payload(self, email, password):
        return {
            "email": email,
            "password": password
        }

    
    def request_otp_api(self, email, password, case_name, expected_message):
        try:
            url = "/api/v1/auth/login/"

            data = self.create_payload(
                email=email,
                password=password
            )

            response = api_call(
                url=url, 
                method=HTTPMethod.POST.value, 
                data=data,
                auth_token=None
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
            print(f"❌ Error requesting OTP for tenant: {e}")



    def start_test(self):
        print("✅ Starting Request OTP Test")

        self.request_otp_api(self.email, self.password, case_name="Valid Credentials", expected_message="OTP sent to email")
        self.request_otp_api(self.missing_email, self.password, case_name="Email Required", expected_message="Email is required.")
        self.request_otp_api(self.invalid_email, self.password, case_name="Invalid Email", expected_message="Enter a valid email address.")
        self.request_otp_api(self.email, self.missing_password, case_name="Password Required", expected_message="Password is required.")
        self.request_otp_api(self.email, self.password_lt12, case_name="Password Length < 12", expected_message="Password must be at least 12 characters long.")
        self.request_otp_api(self.email, self.password_gt_64, case_name="Password Length > 64", expected_message="Password cannot exceed 64 characters.")
        self.request_otp_api(self.email, self.password_no_upper, case_name="Password No Uppercase", expected_message="Password must contain at least one uppercase letter.")
        self.request_otp_api(self.email, self.password_no_lower, case_name="Password No Lowercase", expected_message="Password must contain at least one lowercase letter.")
        self.request_otp_api(self.email, self.password_no_digit, case_name="Password No Digit", expected_message="Password must contain at least one number.")
        self.request_otp_api(self.email, self.password_no_special, case_name="Password No Special Character", expected_message="Password must contain at least one special character.")
        self.request_otp_api(self.email2, self.incorrect_password, case_name="Incorrect Password", expected_message="Incorrect email or password.")
        self.request_otp_api(self.email2, self.password, case_name="Valid Credentials", expected_message="OTP sent to email")


        return self.test_case