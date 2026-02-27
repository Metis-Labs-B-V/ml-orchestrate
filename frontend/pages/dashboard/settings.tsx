import type { FormEvent } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MLAlert,
  MLAlertDescription,
  MLAlertTitle,
  MLButton,
  MLCardTitle,
  MLInput,
  MLLabel,
  MLSkeleton,
} from "ml-uikit";

import TranslateSwitcher from "../../components/i18n/TranslateSwitcher";
import { useI18n } from "../../lib/i18n";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  confirmMfa,
  disableMfa,
  fetchProfile,
  resetState,
  setMfaCode,
  startMfaSetup,
  updateProfile,
  updateProfileField,
} from "../../store/slices/settingsSlice";
import { logoutSession } from "../../store/slices/sessionSlice";
import type { DashboardPage } from "../../types/dashboard";

const Settings: DashboardPage = () => {
  const { t } = useI18n();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const {
    profile,
    error,
    profileForm,
    profileStatus,
    isLoading,
    mfaSetup,
    mfaCode,
    mfaStatus,
  } = useAppSelector((state) => state.settings);

  useEffect(() => {
    dispatch(fetchProfile());
  }, [dispatch]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const handleStartMfaSetup = async () => {
    dispatch(startMfaSetup());
  };

  const handleConfirmMfa = async () => {
    dispatch(confirmMfa({ code: mfaCode }));
  };

  const handleDisableMfa = async () => {
    dispatch(disableMfa({ code: mfaCode }));
  };

  const handleUpdateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    dispatch(updateProfile({ form: profileForm }));
  };

  return (
    <>
      {error ? (
        <MLAlert className="login-alert">
          <MLAlertTitle>Settings error</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}

      <section className="dashboard-profile" id="profile">
        <MLCardTitle>{t("dashboard.profile")}</MLCardTitle>
        {isLoading ? (
          <div className="dashboard-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="dashboard-card">
                <MLSkeleton className="h-4 w-24" />
                <MLSkeleton className="mt-3 h-10 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <form className="dashboard-grid" onSubmit={handleUpdateProfile}>
            <div className="dashboard-card">
              <MLLabel htmlFor="first_name">{t("profile.firstName")}</MLLabel>
              <MLInput
                id="first_name"
                value={profileForm.first_name}
                onChange={(event) =>
                  dispatch(
                    updateProfileField({
                      field: "first_name",
                      value: event.target.value,
                    })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="last_name">{t("profile.lastName")}</MLLabel>
              <MLInput
                id="last_name"
                value={profileForm.last_name}
                onChange={(event) =>
                  dispatch(
                    updateProfileField({
                      field: "last_name",
                      value: event.target.value,
                    })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="phone">{t("profile.phone")}</MLLabel>
              <MLInput
                id="phone"
                value={profileForm.phone}
                onChange={(event) =>
                  dispatch(
                    updateProfileField({ field: "phone", value: event.target.value })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="avatar_url">{t("profile.avatarUrl")}</MLLabel>
              <MLInput
                id="avatar_url"
                value={profileForm.avatar_url}
                onChange={(event) =>
                  dispatch(
                    updateProfileField({
                      field: "avatar_url",
                      value: event.target.value,
                    })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="timezone">{t("profile.timezone")}</MLLabel>
              <MLInput
                id="timezone"
                value={profileForm.timezone}
                onChange={(event) =>
                  dispatch(
                    updateProfileField({
                      field: "timezone",
                      value: event.target.value,
                    })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLLabel htmlFor="locale">{t("profile.locale")}</MLLabel>
              <MLInput
                id="locale"
                value={profileForm.locale}
                onChange={(event) =>
                  dispatch(
                    updateProfileField({
                      field: "locale",
                      value: event.target.value,
                    })
                  )
                }
              />
            </div>
            <div className="dashboard-card">
              <MLButton type="submit" className="login-primary">
                {t("profile.save")}
              </MLButton>
              {profileStatus ? <p className="dashboard-muted">{profileStatus}</p> : null}
            </div>
          </form>
        )}
      </section>

      <section className="dashboard-profile">
        <MLCardTitle>{t("settings.language")}</MLCardTitle>
        <div className="dashboard-card">
          <TranslateSwitcher />
        </div>
      </section>

      <section className="dashboard-profile">
        <MLCardTitle>{t("settings.security")}</MLCardTitle>
        {isLoading ? (
          <div className="dashboard-grid">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="dashboard-card">
                <MLSkeleton className="h-4 w-24" />
                <MLSkeleton className="mt-3 h-10 w-full" />
                <MLSkeleton className="mt-3 h-8 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-grid">
            <div className="dashboard-card">
              <p>{t("dashboard.mfa")}</p>
              <p className="dashboard-muted">Require a second factor at login.</p>
              <MLButton variant="secondary" onClick={handleStartMfaSetup}>
                Setup MFA
              </MLButton>
              {mfaSetup ? (
                <div className="dashboard-muted">
                  <p>Secret: {mfaSetup.secret}</p>
                  <p>OTP URI: {mfaSetup.otpauth_url}</p>
                </div>
              ) : null}
              <MLInput
                value={mfaCode}
                onChange={(event) => dispatch(setMfaCode(event.target.value))}
                placeholder="Enter 6-digit code"
              />
              <MLButton variant="secondary" onClick={handleConfirmMfa}>
                Verify & Enable
              </MLButton>
              <MLButton variant="outline" onClick={handleDisableMfa}>
                Disable MFA
              </MLButton>
              {mfaStatus ? <p className="dashboard-muted">{mfaStatus}</p> : null}
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-profile">
        <MLCardTitle>{t("settings.account")}</MLCardTitle>
        <div className="dashboard-card">
          <p className="dashboard-muted">Signed in as {profile?.email || "unknown"}</p>
          <MLButton
            variant="outline"
            onClick={() =>
              dispatch(logoutSession()).finally(() => {
                router.replace("/");
              })
            }
          >
            {t("settings.clearSession")}
          </MLButton>
        </div>
      </section>
    </>
  );
};

Settings.dashboardMeta = (t) => ({
  title: t("settings.title"),
  description: t("settings.description"),
});

export default Settings;
