# email.split('@')[0]}_VERIFICATION_LINK

import random
from api_call import api_call
from enums import HTTPMethod

class TenantRoles():
    tenant_id = None
    tenant_access_token = None
    tenant_roles = []

    tenant2_id = None
    tenant2_access_token = None
    tenant2_roles = []

    test_case = []



    def __init__(self, tenant_access_token, tenant2_access_token, tenant_id, tenant2_id):
        self.tenant_access_token = tenant_access_token
        self.tenant2_access_token = tenant2_access_token
        self.tenant_id = tenant_id
        self.tenant2_id = tenant2_id

    def create_test_case(self, name, payload, response, message, result):
        case = {}
        case["name"] = name
        case["payload"] = payload
        case["response"] = response
        case["message"] = message
        case["result"] = result
        self.test_case.append(case)

    
    def request_user_roles_api(self, tenant_id, auth_token, case_name, expected_message):
        try:
            url = f"/api/v1/tenants/{tenant_id}/roles/"

            response = api_call(
                url=url, 
                method=HTTPMethod.GET.value, 
                data=None,
                auth_token=auth_token
            )
            
            self.create_test_case(
                name=case_name,
                payload=None,
                response=response,
                message = response.get("message"),
                result="Passed" if response.get("message") == expected_message else "Failed"
            )

            roles_data = response.get("data")
            if isinstance(roles_data, list):
                parsed_roles = roles_data
            elif isinstance(roles_data, dict):
                parsed_roles = roles_data.get("roles", [])
            else:
                parsed_roles = []

            if tenant_id == self.tenant_id:
                self.tenant_roles = parsed_roles

            if tenant_id == self.tenant2_id:
                self.tenant2_roles = parsed_roles

            # print(f"{case_name}: {'Passed' if response.get('message') == expected_message else 'Failed'}")
            # print(response.get("message"))
            # print("--------------------------------------------------")

        except Exception as e:
            print(f"❌ Error requesting user roles for tenant: {e}")



    def start_test(self):
        print("✅ Starting Tenant User Roles Test")

        self.request_user_roles_api(self.tenant_id, self.tenant_access_token, case_name="Valid Roles", expected_message="Success")
        self.request_user_roles_api(self.tenant2_id, self.tenant2_access_token, case_name="Valid Roles", expected_message="Success")


        return self.test_case, self.tenant_roles, self.tenant2_roles
