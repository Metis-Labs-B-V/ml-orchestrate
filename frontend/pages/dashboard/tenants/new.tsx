import { useEffect } from "react";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCardTitle,
  MLInput,
  MLLabel,
} from "ml-uikit";

import { hasTenantWriteAccess } from "../../../lib/roles";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import {
  addTenantUser,
  onboardTenant,
  resetState,
  updateField,
} from "../../../store/slices/tenantsNewSlice";
import type { DashboardPage } from "../../../types/dashboard";

const TenantCreate: DashboardPage = () => {
  const dispatch = useAppDispatch();
  const {
    tenantName,
    ownerEmail,
    ownerFirstName,
    ownerLastName,
    ownerPassword,
    tenantId,
    userEmail,
    userPassword,
    status,
    error,
  } = useAppSelector((state) => state.tenantsNew);
  const currentUser = useAppSelector((state) => state.session.user);
  const isSuperAdmin = Boolean(currentUser?.is_superuser);
  const canManageUsers = hasTenantWriteAccess(currentUser);

  useEffect(() => {
    if (currentUser?.tenants?.length && !currentUser?.is_superuser) {
      dispatch(updateField({ field: "tenantId", value: String(currentUser.tenants[0].id) }));
    }
  }, [currentUser, dispatch]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const handleOnboard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch(
      onboardTenant({
        tenantName,
        ownerEmail,
        ownerPassword,
        ownerFirstName,
        ownerLastName,
      })
    );
  };

  const handleAddUser = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId) {
      dispatch(
        updateField({ field: "error", value: "Provide a tenant ID first." })
      );
      return;
    }
    dispatch(addTenantUser({ tenantId, userEmail, userPassword }));
  };

  return (
    <>
      {error ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Action failed</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}
      {status ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Success</MLAlertTitle>
          <MLAlertDescription>{status}</MLAlertDescription>
        </MLAlert>
      ) : null}

      {isSuperAdmin ? (
        <section className="dashboard-profile">
          <MLCardTitle>Onboard tenant</MLCardTitle>
          <form className="dashboard-grid" onSubmit={handleOnboard}>
            <div className="dashboard-card">
              <MLLabel htmlFor="tenant_name">Tenant name</MLLabel>
              <MLInput
                id="tenant_name"
                value={tenantName}
                onChange={(event) =>
                  dispatch(updateField({ field: "tenantName", value: event.target.value }))
                }
                required
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="owner_email">Owner email</MLLabel>
              <MLInput
                id="owner_email"
                type="email"
                value={ownerEmail}
                onChange={(event) =>
                  dispatch(updateField({ field: "ownerEmail", value: event.target.value }))
                }
                required
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="owner_first">Owner first name</MLLabel>
              <MLInput
                id="owner_first"
                value={ownerFirstName}
                onChange={(event) =>
                  dispatch(
                    updateField({ field: "ownerFirstName", value: event.target.value })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="owner_last">Owner last name</MLLabel>
              <MLInput
                id="owner_last"
                value={ownerLastName}
                onChange={(event) =>
                  dispatch(
                    updateField({ field: "ownerLastName", value: event.target.value })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="owner_password">Owner password</MLLabel>
              <MLInput
                id="owner_password"
                type="password"
                value={ownerPassword}
                onChange={(event) =>
                  dispatch(
                    updateField({ field: "ownerPassword", value: event.target.value })
                  )
                }
                required
              />
            </div>
            <div className="dashboard-card">
              <MLButton type="submit" className="login-primary">
                Create tenant
              </MLButton>
            </div>
          </form>
        </section>
      ) : (
        <MLAlert className="login-alert">
          <MLAlertTitle>Access restricted</MLAlertTitle>
          <MLAlertDescription>Only super admins can create tenants.</MLAlertDescription>
        </MLAlert>
      )}

      {canManageUsers ? (
        <section className="dashboard-profile">
          <MLCardTitle>Onboard users</MLCardTitle>
          <form className="dashboard-grid" onSubmit={handleAddUser}>
            <div className="dashboard-card">
              <MLLabel htmlFor="tenant_id">Tenant ID</MLLabel>
              <MLInput
                id="tenant_id"
                value={tenantId}
                onChange={(event) =>
                  dispatch(updateField({ field: "tenantId", value: event.target.value }))
                }
                required
                disabled={!isSuperAdmin}
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="user_email">User email</MLLabel>
              <MLInput
                id="user_email"
                type="email"
                value={userEmail}
                onChange={(event) =>
                  dispatch(updateField({ field: "userEmail", value: event.target.value }))
                }
                required
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="user_password">User password</MLLabel>
              <MLInput
                id="user_password"
                type="password"
                value={userPassword}
                onChange={(event) =>
                  dispatch(
                    updateField({ field: "userPassword", value: event.target.value })
                  )
                }
                required
              />
            </div>
            <div className="dashboard-card">
              <MLButton type="submit" className="login-primary">
                Add user
              </MLButton>
            </div>
          </form>
        </section>
      ) : (
        <MLAlert className="login-alert">
          <MLAlertTitle>Access restricted</MLAlertTitle>
          <MLAlertDescription>Only tenant admins can add users.</MLAlertDescription>
        </MLAlert>
      )}
    </>
  );
};

TenantCreate.dashboardMeta = {
  title: "Create tenant",
  description: "Onboard tenants and manage their users.",
};

export default TenantCreate;
