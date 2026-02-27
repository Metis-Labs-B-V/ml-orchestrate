# email.split('@')[0]}_VERIFICATION_LINK

import random
from api_call import api_call
from enums import HTTPMethod

class ValidateOTP():
    email = None
    email2 = None
    password = None
    otp = None

    tenant_details = []

    invalid_otp = "000000"
    missing_otp = None



    test_case = []




    def __init__(self, email, email2, password, otp, otp2):
        self.email = email
        self.email2 = email2
        self.password = password
        self.otp = otp


    def create_test_case(self, name, payload, response, message, result):
        case = {}
        case["name"] = name
        case["payload"] = payload
        case["response"] = response
        case["message"] = message
        case["result"] = result
        self.test_case.append(case)



    def create_payload(self, email, password, otp):
        return {
            "email": email,
            "password": password,
            "otp": otp
        }

    
    def validate_otp_api(self, email, password, otp, case_name, expected_message):
        try:
            url = "/api/v1/auth/verify-login-otp/"

            data = self.create_payload(
                email=email,
                password=password,
                otp=otp
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

            if data.get("email") == self.email and data.get("otp") == self.otp and expected_message == "Logged in successfully.":
                self.tenant_details.append(response.get("data"))
            if data.get("email") == self.email2 and data.get("otp") == self.otp and expected_message == "Logged in successfully.":
                self.tenant_details.append(response.get("data"))

            # print(f"{case_name}: {'Passed' if response.get('message') == expected_message else 'Failed'}")
            # print(response.get("message"))
            # print("--------------------------------------------------")

        except Exception as e:
            print(f"❌ Error validating OTP: {e}")



    def start_test(self):
        print("✅ Starting Validate Login OTP Test")
        self.validate_otp_api(self.email, self.password, self.invalid_otp, case_name="Invalid OTP", expected_message="Incorrect OTP.")
        self.validate_otp_api(self.email, self.password, self.missing_otp, case_name="Missing OTP", expected_message="Invalid or expired OTP.")
        self.validate_otp_api(self.email, self.password, self.otp, case_name="Valid Credentials and OTP", expected_message="Logged in successfully.")
        self.validate_otp_api(self.email2, self.password, self.otp, case_name="Valid Credentials and OTP", expected_message="Logged in successfully.")
        self.validate_otp_api(self.email2, self.password, self.otp, case_name="Valid Credentials after OTP used", expected_message="Invalid or expired OTP.")
        return self.test_case, self.tenant_details