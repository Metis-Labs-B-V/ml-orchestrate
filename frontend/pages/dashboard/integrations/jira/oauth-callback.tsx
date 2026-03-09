import { useEffect, useState } from "react";

import { exchangeJiraOauth } from "../../../../lib/scenariosApi";
import type { DashboardPage } from "../../../../types/dashboard";

const JiraOauthCallbackPage: DashboardPage = () => {
  const [message, setMessage] = useState("Completing Jira OAuth...");
  const [error, setError] = useState("");

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(hash);
    const getParam = (name: string) => queryParams.get(name) || hashParams.get(name) || "";

    const code = getParam("code");
    const state = getParam("state");
    const providerError = getParam("error_description") || getParam("error");
    const accessToken = getParam("access_token");

    if (providerError) {
      setError(providerError);
      setMessage("OAuth failed.");
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: "metis:jira-oauth-error",
            message: providerError,
          },
          window.location.origin
        );
      }
      return;
    }

    if (!code || !state) {
      const msg = accessToken
        ? "OAuth callback returned access_token without authorization code. Please configure the Atlassian app to use OAuth 2.0 (3LO) Authorization Code flow."
        : state
          ? "Atlassian redirected back without an authorization code. Check the app's Authorization settings in the Atlassian developer console and make sure the callback URL exactly matches the configured redirect URI."
          : "Missing OAuth code/state in callback URL.";
      setError(msg);
      setMessage("OAuth failed.");
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: "metis:jira-oauth-error",
            message: msg,
          },
          window.location.origin
        );
      }
      return;
    }

    let canceled = false;
    const run = async () => {
      try {
        const connection = await exchangeJiraOauth({ code, state });
        if (canceled) {
          return;
        }
        setMessage("Jira connection created. Closing window...");
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "metis:jira-oauth-success",
              connection,
            },
            window.location.origin
          );
        } else {
          window.location.replace("/dashboard/scenarios");
          return;
        }
        window.setTimeout(() => {
          window.close();
        }, 400);
      } catch (exchangeError) {
        if (canceled) {
          return;
        }
        const msg =
          exchangeError instanceof Error ? exchangeError.message : "Unable to complete Jira OAuth.";
        setError(msg);
        setMessage("OAuth failed.");
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "metis:jira-oauth-error",
              message: msg,
            },
            window.location.origin
          );
        }
      }
    };

    void run();
    return () => {
      canceled = true;
    };
  }, []);

  return (
    <section className="oauth-callback-page">
      <h1>Jira OAuth</h1>
      <p>{message}</p>
      {error ? <p className="oauth-callback-error">{error}</p> : null}
      <p className="oauth-callback-hint">You can close this tab if it does not close automatically.</p>
    </section>
  );
};

JiraOauthCallbackPage.dashboardMeta = () => ({
  title: "Jira OAuth",
  description: "Finalizing Jira connection",
});

export default JiraOauthCallbackPage;
