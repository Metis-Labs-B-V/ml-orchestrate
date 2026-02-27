import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCardTitle,
  MLCheckbox,
  MLInput,
  MLLabel,
  MLSkeleton,
} from "ml-uikit";

import { apiFetch } from "../../../../../lib/api";
import { API_PATHS } from "../../../../../lib/apiPaths";
import { hasTenantWriteAccess } from "../../../../../lib/roles";
import { useAppSelector } from "../../../../../store/hooks";
import type { DashboardPage } from "../../../../../types/dashboard";

type Role = {
  id: number;
  name: string;
  slug?: string;
  description?: string;
};

const AddTenantUser: DashboardPage = () => {
  const router = useRouter();
  const pathname = usePathname() || "";
  const tenantId = useMemo(() => pathname.split("/").slice(-3)[0] || "", [pathname]);
  const currentUser = useAppSelector((state) => state.session.user);
  const canWrite = hasTenantWriteAccess(currentUser);

  const [roles, setRoles] = useState<Role[]>([]);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!tenantId) {
      return;
    }
    let active = true;
    const loadRoles = async () => {
      setIsLoading(true);
      setError("");
      try {
        const response = await apiFetch(API_PATHS.tenants.roles(tenantId));
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload?.message || "Unable to load roles.");
        }
        const items = Array.isArray(payload?.data?.items)
          ? (payload.data.items as Role[])
          : Array.isArray(payload?.data)
            ? (payload.data as Role[])
            : [];
        if (active) {
          setRoles(items);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : "Unable to load roles.");
          setRoles([]);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };
    loadRoles();
    return () => {
      active = false;
    };
  }, [tenantId]);

  const toggleRole = (roleId: number) => {
    setRoleIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canWrite) {
      setError("You do not have permission to add users.");
      return;
    }
    if (!tenantId) {
      setError("Missing tenant id.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setStatus("");
    try {
      const payload: Record<string, unknown> = {
        email,
        first_name: firstName,
        last_name: lastName,
        send_invite: true,
      };
      if (roleIds.length) {
        payload.role_ids = roleIds;
      }
      const response = await apiFetch(API_PATHS.tenants.users(tenantId), {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message || "Unable to add user.");
      }
      setStatus("Invite sent. The user will receive a reset password link.");
      setEmail("");
      setFirstName("");
      setLastName("");
      setRoleIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add user.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="dashboard-profile">
      <div className="tenant-header">
        <div>
          <MLCardTitle>Add tenant user</MLCardTitle>
          <p className="dashboard-muted">Invite a new user to this tenant.</p>
        </div>
        <MLButton variant="outline" onClick={() => router.push(`/dashboard/tenants/${tenantId}`)}>
          Back to tenant
        </MLButton>
      </div>

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

      <form className="dashboard-grid" onSubmit={handleSubmit}>
        <div className="dashboard-card">
          <MLLabel htmlFor="user_email">Work email</MLLabel>
          <MLInput
            id="user_email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="dashboard-card">
          <MLLabel htmlFor="user_first">First name</MLLabel>
          <MLInput
            id="user_first"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <div className="dashboard-card">
          <MLLabel htmlFor="user_last">Last name</MLLabel>
          <MLInput
            id="user_last"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
        <div className="dashboard-card">
          <MLLabel>Roles</MLLabel>
          {isLoading ? (
            <div className="dashboard-grid">
              {Array.from({ length: 3 }).map((_, index) => (
                <MLSkeleton key={index} className="h-4 w-full" />
              ))}
            </div>
          ) : roles.length ? (
            <div className="dashboard-grid">
              {roles.map((role) => (
                <label key={role.id} className="role-flag">
                  <MLCheckbox
                    checked={roleIds.includes(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                  />
                  <span>{role.name}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="dashboard-muted">No roles available.</p>
          )}
        </div>
        <div className="dashboard-card">
          <MLButton
            type="submit"
            className="tenant-add-button"
            disabled={!canWrite || isSubmitting}
          >
            {isSubmitting ? "Sending..." : "Send invite"}
          </MLButton>
        </div>
      </form>
    </section>
  );
};

AddTenantUser.dashboardMeta = {
  title: "Add tenant user",
  description: "Invite a new tenant user.",
};

export default AddTenantUser;
