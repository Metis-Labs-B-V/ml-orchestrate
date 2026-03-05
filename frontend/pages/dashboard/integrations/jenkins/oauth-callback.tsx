import { useEffect, useState } from "react";

import { exchangeJenkinsOauth } from "../../../../lib/scenariosApi";
import type { DashboardPage } from "../../../../types/dashboard";

const JenkinsOauthCallbackPage: DashboardPage = () => {
  const [message, setMessage] = useState("Completing Jenkins OAuth...");
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
            type: "metis:jenkins-oauth-error",
            message: providerError,
          },
          window.location.origin
        );
      }
      return;
    }

    if (!code || !state) {
      const msg = accessToken
        ? "OAuth callback returned access_token without authorization code."
        : "Missing OAuth code/state in callback URL.";
      setError(msg);
      setMessage("OAuth failed.");
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage(
          {
            type: "metis:jenkins-oauth-error",
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
        const connection = await exchangeJenkinsOauth({ code, state });
        if (canceled) {
          return;
        }
        setMessage("Jenkins connection created. Closing window...");
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "metis:jenkins-oauth-success",
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
          exchangeError instanceof Error ? exchangeError.message : "Unable to complete Jenkins OAuth.";
        setError(msg);
        setMessage("OAuth failed.");
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            {
              type: "metis:jenkins-oauth-error",
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
      <h1>Jenkins OAuth</h1>
      <p>{message}</p>
      {error ? <p className="oauth-callback-error">{error}</p> : null}
      <p className="oauth-callback-hint">You can close this tab if it does not close automatically.</p>
    </section>
  );
};

JenkinsOauthCallbackPage.dashboardMeta = () => ({
  title: "Jenkins OAuth",
  description: "Finalizing Jenkins connection",
});

export default JenkinsOauthCallbackPage;
