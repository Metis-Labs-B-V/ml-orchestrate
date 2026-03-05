import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MLAlert, MLAlertDescription, MLAlertTitle, MLButton } from "ml-uikit";
import { Plus, RefreshCw } from "lucide-react";

import { createScenario, listScenarios } from "../../../lib/scenariosApi";
import type { DashboardPage } from "../../../types/dashboard";
import type { ScenarioRecord } from "../../../types/scenarios";

const ScenariosPage: DashboardPage = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [scenarios, setScenarios] = useState<ScenarioRecord[]>([]);

  const loadScenarios = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const payload = await listScenarios({});
      setScenarios(payload.items || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load scenarios.");
      setScenarios([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  const handleCreateScenario = async () => {
    setIsCreating(true);
    setError("");
    try {
      const scenario = await createScenario({
        name: "New scenario",
        graph_json: { nodes: [], edges: [] },
      });
      router.push(`/dashboard/scenarios/${scenario.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create scenario.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <section className="scenarios-page">
      {error ? (
        <MLAlert className="scenarios-alert">
          <MLAlertTitle>Scenario error</MLAlertTitle>
          <MLAlertDescription>{error}</MLAlertDescription>
        </MLAlert>
      ) : null}

      <div className="scenarios-toolbar">
        <div className="scenarios-toolbar-actions">
          <MLButton
            type="button"
            variant="outline"
            className="scenarios-refresh"
            onClick={loadScenarios}
            disabled={isLoading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </MLButton>
          <MLButton
            type="button"
            className="scenarios-create"
            onClick={handleCreateScenario}
            disabled={isCreating}
          >
            <Plus className="h-4 w-4" />
            {isCreating ? "Creating..." : "Add scenario"}
          </MLButton>
        </div>
      </div>

      <div className="scenarios-grid">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div
              key={`scenario-skeleton-${index}`}
              className="scenario-card scenario-card--loading"
              aria-hidden="true"
            >
              <div className="scenario-card-header">
                <div className="ui-shimmer-line ui-shimmer-line--md" />
                <div className="ui-shimmer-line ui-shimmer-line--pill" />
              </div>
              <div className="ui-shimmer-line ui-shimmer-line--full" />
              <div className="ui-shimmer-line ui-shimmer-line--sm" />
            </div>
          ))
        ) : scenarios.length ? (
          scenarios.map((scenario) => (
            <button
              key={scenario.id}
              type="button"
              className="scenario-card"
              onClick={() => router.push(`/dashboard/scenarios/${scenario.id}`)}
            >
              <div className="scenario-card-header">
                <h3>{scenario.name}</h3>
                <span className={`scenario-status scenario-status--${scenario.status}`}>
                  {scenario.status}
                </span>
              </div>
              <p>{scenario.description || "No description yet."}</p>
              <div className="scenario-card-meta">
                <span>Updated: {new Date(scenario.updated_at).toLocaleString()}</span>
                <span>Version: v{scenario.current_version}</span>
              </div>
            </button>
          ))
        ) : (
          <p className="scenarios-empty">
            No scenarios found. Click Add scenario to create one.
          </p>
        )}
      </div>
    </section>
  );
};

ScenariosPage.dashboardMeta = (t) => ({
  title: t("nav.scenarios"),
  description: "Create and manage orchestration scenarios.",
});

export default ScenariosPage;
