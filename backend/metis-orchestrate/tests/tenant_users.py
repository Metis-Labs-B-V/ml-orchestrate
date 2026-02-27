# email.split('@')[0]}_VERIFICATION_LINK

from uuid import uuid4
from api_call import api_call
from enums import HTTPMethod

class TenantUsers():
    tenant_id = None
    tenant_access_token = None
    tenant_roles = []

    tenant2_id = None
    tenant2_access_token = None
    tenant2_roles = []

    tenant1_admin_user_email = None
    tenant1_finance_user_email = None
    tenant1_other_user_email = None

    tenant2_admin_user_email = None
    tenant2_finance_user_email = None
    tenant2_other_user_email = None
    invalid_role_user_email = None
    invalid_tenant_id = 999


    tenant_user_details = []
    tenant2_user_details = []


    invalid_email = "invalid-email"
    existing_email = "admin@admin.com"
    missing_email = None

    test_case = []



    def __init__(self, tenant_access_token, tenant2_access_token, tenant_id, tenant2_id, tenant_roles, tenant2_roles):
        self.tenant_access_token = tenant_access_token
        self.tenant2_access_token = tenant2_access_token
        self.tenant_id = tenant_id
        self.tenant2_id = tenant2_id
        self.tenant_roles = tenant_roles
        self.tenant2_roles = tenant2_roles

        uniq = uuid4().hex[:8]
        self.tenant1_admin_user_email = f"test__{uniq}_t1_admin@example.com"
        self.tenant1_finance_user_email = f"test__{uniq}_t1_finance@example.com"
        self.tenant1_other_user_email = f"test__{uniq}_t1_other@example.com"

        self.tenant2_admin_user_email = f"test__{uniq}_t2_admin@example.com"
        self.tenant2_finance_user_email = f"test__{uniq}_t2_finance@example.com"
        self.tenant2_other_user_email = f"test__{uniq}_t2_other@example.com"
        self.invalid_role_user_email = f"test__{uniq}_invalid_role@example.com"


    def create_test_case(self, name, payload, response, message, result):
        case = {}
        case["name"] = name
        case["payload"] = payload
        case["response"] = response
        case["message"] = message
        case["result"] = result
        self.test_case.append(case)

    
    def create_payload(self, email, role_id):
        local_part = (email or "").split("@")[0]
        job_title = local_part.rsplit("_", 1)[-1] if "_" in local_part else "User"

        return {
            "email": email,
            "first_name": local_part,
            "last_name": "LAST_NAME",
            "job_title": job_title,
            "role_ids": [role_id]
        }

    
    def create_tenant_user_api(self, tenant_id, auth_token, email, role_id, case_name, expected_message):
        try:
            url = f"/api/v1/tenants/{tenant_id}/users/"

            data = self.create_payload(
                email=email,
                role_id=role_id
            )

            response = api_call(
                url=url, 
                method=HTTPMethod.POST.value, 
                data=data,
                auth_token=auth_token
            )

            expected_messages = expected_message if isinstance(expected_message, (list, tuple, set)) else [expected_message]
            is_passed = response.get("message") in expected_messages
            
            self.create_test_case(
                name=case_name,
                payload=data,
                response=response,
                message = response.get("message"),
                result="Passed" if is_passed else "Failed"
            )

            if tenant_id == self.tenant_id:
                self.tenant_user_details.append(response.get("data"))
            else:
                self.tenant2_user_details.append(response.get("data"))

            # print(f"{case_name}: {'Passed' if is_passed else 'Failed'}")
            # print(response.get("message"))
            # print("--------------------------------------------------")

        except Exception as e:
            print(f"❌ Error creating tenant user : {e}")



    def start_test(self):
        print("✅ Starting Tenant User Roles Test")

        self.create_tenant_user_api(self.tenant2_id, self.tenant2_access_token, self.invalid_email, self.tenant2_roles[0].get("id"), case_name="Tenant 2 Invalid Email", expected_message="Enter a valid email address.")
        self.create_tenant_user_api(self.tenant2_id, self.tenant2_access_token, self.missing_email, self.tenant2_roles[0].get("id"), case_name="Tenant 2 Missing Email", expected_message="Email is required.")
        self.create_tenant_user_api(self.tenant2_id, self.tenant2_access_token, self.existing_email, self.tenant2_roles[0].get("id"), case_name="Tenant 2 Existing Email", expected_message="Email already registered.")
        self.create_tenant_user_api(self.tenant_id,self.tenant_access_token,self.invalid_role_user_email,self.tenant2_roles[0].get("id"),case_name="Invalid Tenant Role",expected_message="Invalid payload")
        self.create_tenant_user_api(self.invalid_tenant_id,self.tenant_access_token,self.invalid_role_user_email,self.tenant2_roles[0].get("id"),case_name="Invalid Tenant ID",expected_message="Forbidden")

        for tenant_role in self.tenant_roles:
            if tenant_role.get("name") == "Admin":
                self.create_tenant_user_api(self.tenant_id, self.tenant_access_token, self.tenant1_admin_user_email, tenant_role.get("id"), case_name="Tenant 1 Admin Role", expected_message="User created")
            elif tenant_role.get("name") == "Finance":
                self.create_tenant_user_api(self.tenant_id, self.tenant_access_token, self.tenant1_finance_user_email, tenant_role.get("id"), case_name="Tenant 1 Finance Role", expected_message="User created")
            else:
                self.create_tenant_user_api(self.tenant_id, self.tenant_access_token, self.tenant1_other_user_email, tenant_role.get("id"), case_name="Tenant 1 Other Role", expected_message="User created")

        for tenant_role in self.tenant2_roles:
            if tenant_role.get("name") == "Admin":
                self.create_tenant_user_api(self.tenant2_id, self.tenant2_access_token, self.tenant2_admin_user_email, tenant_role.get("id"), case_name="Tenant 2 Admin Role", expected_message="User created")
            elif tenant_role.get("name") == "Finance":
                self.create_tenant_user_api(self.tenant2_id, self.tenant2_access_token, self.tenant2_finance_user_email, tenant_role.get("id"), case_name="Tenant 2 Finance Role", expected_message="User created")
            else:
                self.create_tenant_user_api(self.tenant2_id, self.tenant2_access_token, self.tenant2_other_user_email, tenant_role.get("id"), case_name="Tenant 2 Other Role", expected_message="User created")

        


        return self.test_case, self.tenant_user_details, self.tenant2_user_details
