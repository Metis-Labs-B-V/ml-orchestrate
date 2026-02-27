import { useEffect, useState } from "react";
import axiosClient from "../../lib/axiosClient";
import { MLTypography, MLButton, MLCard, MLCardContent } from "ml-uikit";

const service1Base = process.env.NEXT_PUBLIC_SERVICE1_BASE_URL;
const service2Base = process.env.NEXT_PUBLIC_SERVICE2_BASE_URL;

type HealthState = {
  service1: string;
  service2: string;
  error: string;
};

export default function Home() {
  const [health, setHealth] = useState<HealthState>({
    service1: "unknown",
    service2: "unknown",
    error: "",
  });

  const checkHealth = async () => {
    if (!service1Base || !service2Base) {
      setHealth({
        service1: "unknown",
        service2: "unknown",
        error: "Base URLs are not configured.",
      });
      return;
    }
    const [service1Res, service2Res] = await Promise.allSettled([
      axiosClient.get(`${service1Base}/health/`),
      axiosClient.get(`${service2Base}/health/`),
    ]);

    const nextHealth = {
      service1:
        service1Res.status === "fulfilled"
          ? service1Res.value.data.status || "ok"
          : "unreachable",
      service2:
        service2Res.status === "fulfilled"
          ? service2Res.value.data.status || "ok"
          : "unreachable",
      error: "",
    };

    const errors: string[] = [];
    if (service1Res.status === "rejected") {
      errors.push(`Service 1: ${service1Res.reason?.message || "unreachable"}`);
    }
    if (service2Res.status === "rejected") {
      errors.push(`Service 2: ${service2Res.reason?.message || "unreachable"}`);
    }
    nextHealth.error = errors.join(" | ");

    setHealth(nextHealth);
  };

  useEffect(() => {
    if (service1Base && service2Base) {
      checkHealth();
    }
  }, []);

  return (
    <MLTypography as="main" className="page">
      <MLTypography as="div" className="background-orb orb-one" />
      <MLTypography as="div" className="background-orb orb-two" />
      <section className="hero">
        <MLTypography as="div" variant="body-xs-regular" className="eyebrow">
          Bolify
        </MLTypography>
        <MLTypography as="h1" variant="h1">
          Dual Service Starter
        </MLTypography>
        <MLTypography as="p" variant="body-base-regular">
          Frontend is wired to both backend services with separate base URLs, health checks, and a
          shared utility layer.
        </MLTypography>
        <MLTypography as="div" className="cta-row">
          <MLButton className="primary" onClick={checkHealth}>
            Refresh Health
          </MLButton>
          <MLTypography as="span" variant="body-s-regular" className="hint">
            Run both services via docker-compose.
          </MLTypography>
        </MLTypography>
      </section>

      <section className="grid">
        <MLCard className="card">
          <MLCardContent className="card-body">
            <MLTypography as="div" variant="body-base-semibold" className="card-title">
              Service 1
            </MLTypography>
            <MLTypography as="div" variant="body-s-regular" className="label">
              Base URL
            </MLTypography>
            <code>{service1Base || "(not set)"}</code>
            <MLTypography as="div" variant="body-s-regular" className="label">
              Health
            </MLTypography>
            <MLTypography as="div" variant="body-s-semibold" className={`pill ${health.service1}`}>
              {health.service1}
            </MLTypography>
          </MLCardContent>
        </MLCard>

        <MLCard className="card">
          <MLCardContent className="card-body">
            <MLTypography as="div" variant="body-base-semibold" className="card-title">
              Service 2
            </MLTypography>
            <MLTypography as="div" variant="body-s-regular" className="label">
              Base URL
            </MLTypography>
            <code>{service2Base || "(not set)"}</code>
            <MLTypography as="div" variant="body-s-regular" className="label">
              Health
            </MLTypography>
            <MLTypography as="div" variant="body-s-semibold" className={`pill ${health.service2}`}>
              {health.service2}
            </MLTypography>
          </MLCardContent>
        </MLCard>
      </section>

      {health.error ? (
        <section className="error">
          <MLTypography as="strong" variant="body-s-semibold">
            Health check error:
          </MLTypography>{" "}
          <MLTypography as="span" variant="body-s-regular">
            {health.error}
          </MLTypography>
        </section>
      ) : null}
    </MLTypography>
  );
}
