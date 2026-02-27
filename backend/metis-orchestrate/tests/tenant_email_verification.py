# email.split('@')[0]}_VERIFICATION_LINK

import random
from api_call import api_call
from enums import HTTPMethod

class TenantEmailVerification():
    email = None
    valid_token1 = None

    email2 = None
    valid_token2 = None

    invalid_token = "INVALID_VERIFICATION_LINK"
    test_case = []




    def __init__(self, email, email2):
        self.email = email
        self.email2 = email2

        self.valid_token1 = f"{email.split('@')[0]}_VERIFICATION_LINK"
        self.valid_token2 = f"{email2.split('@')[0]}_VERIFICATION_LINK"


    def create_test_case(self, name, payload, response, message, result):
        case = {}
        case["name"] = name
        case["payload"] = payload
        case["response"] = response
        case["message"] = message
        case["result"] = result
        self.test_case.append(case)



    def create_payload(self, token):
        return {
            "token": token
        }

    
    def verify_email_api(self, token, case_name, expected_message):
        try:
            url = "/api/v1/tenant/verify-email/"

            data = self.create_payload(
                token=token
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
            print(f"❌ Error verifying email for tenant: {e}")



    def start_test(self):
        print("✅ Starting Tenant Email Verification Test")

        self.verify_email_api(self.valid_token1, case_name="Valid Token", expected_message="Email verified and user logged in.")
        self.verify_email_api(self.valid_token1, case_name="Token Expired", expected_message="Expired link")
        self.verify_email_api(self.invalid_token, case_name="Invalid Token", expected_message="Invalid link")
        self.verify_email_api(self.valid_token2, case_name="Valid Token", expected_message="Email verified and user logged in.")


        return self.test_case