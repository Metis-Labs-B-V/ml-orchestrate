import { useEffect, useMemo, useState } from "react";
import { MLButton } from "ml-uikit";
import { ArrowUpRight, Clock3, RefreshCw, Search, ShieldCheck } from "lucide-react";

import {
  getRun,
  getScenarioHistorySummary,
  listScenarioAuditEvents,
  listScenarioHistoryRuns,
  type RunHistoryListItem,
  type RunHistorySummary,
  type RunSummary,
  type ScenarioAuditEvent,
} from "../../lib/scenariosApi";
import type { ScenarioNode } from "../../types/scenarios";

type ScenarioHistoryExplorerMode = "history" | "audit";

type ScenarioHistoryExplorerProps = {
  scenarioId: string | number;
  nodes: ScenarioNode[];
  mode: ScenarioHistoryExplorerMode;
  onJumpToNode?: (nodeId: string) => void;
};

type RunStepView = Record<string, unknown>;
type StepInspectorTab = "summary" | "input" | "output" | "error";

const RUN_STATUS_ORDER = ["queued", "running", "succeeded", "failed", "canceled"] as const;
const RUN_TRIGGER_OPTIONS = ["manual", "schedule", "webhook"] as const;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const formatRunLabel = (value: unknown): string =>
  String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase()) || "Unknown";

const formatRunDateTime = (value: unknown): string => {
  if (!value) {
    return "Not recorded";
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatRunDurationMs = (value: unknown): string => {
  const numericValue =
    typeof value === "number" ? value : Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "0 ms";
  }
  if (numericValue < 1000) {
    return `${numericValue} ms`;
  }
  if (numericValue < 60_000) {
    return `${(numericValue / 1000).toFixed(1)} s`;
  }
  return `${(numericValue / 60_000).toFixed(1)} min`;
};

const getRunStepStatus = (step: RunStepView): string =>
  String(step.status || "unknown").trim().toLowerCase() || "unknown";

const getRunStepId = (step: RunStepView, index: number): string =>
  String(step.id || step.node_id || `step-${index}`);

const getRunStepErrorMessage = (step: RunStepView): string => {
  const errorJson = asRecord(step.error_json);
  if (!errorJson) {
    return "";
  }
  return String(errorJson.message || errorJson.detail || "").trim();
};

const getStepSummaryLine = (step: RunStepView): string => {
  const nodeType = String(step.node_type || "");
  const output = asRecord(step.output_raw_json) || asRecord(step.output_normalized_json) || {};
  const input = asRecord(step.input_json) || {};

  if (nodeType.startsWith("http.")) {
    const method = String(output.method || input.method || "").toUpperCase();
    const url = String(output.url || input.url || "");
    const statusCode = output.statusCode || output.status_code;
    return [method, url, statusCode ? `HTTP ${statusCode}` : ""].filter(Boolean).join(" • ");
  }
  if (nodeType.startsWith("jira.")) {
    const issueKey = String(output.issueKey || output.key || input.issueIdOrKey || "");
    return issueKey ? `Issue ${issueKey}` : formatRunLabel(nodeType.replace("jira.", ""));
  }
  if (nodeType.startsWith("hubspot.")) {
    const objectId = output.id || output.objectId || input.objectId;
    return objectId ? `Object ${objectId}` : formatRunLabel(nodeType.replace("hubspot.", ""));
  }
  if (nodeType.startsWith("email.")) {
    const subject =
      String(output.subject || input.subject || input.subjectOverride || "").trim();
    return subject ? `Subject: ${subject}` : "Email delivery step";
  }
  if (nodeType === "json.create") {
    const payload = asRecord(output);
    return payload ? `${Object.keys(payload).length} mapped field(s)` : "JSON payload prepared";
  }
  return formatRunLabel(nodeType);
};

const getAuditEventTone = (eventType: string): string => {
  const t = String(eventType || "").toLowerCase();
  if (t.includes("publish")) return "indigo";
  if (t.includes("activat")) return "green";
  if (t.includes("deactivat")) return "slate";
  if (t.includes("schedule")) return "amber";
  if (t.includes("creat")) return "teal";
  if (t.includes("delet") || t.includes("remov")) return "red";
  if (t.includes("run")) return "purple";
  if (t.includes("edit") || t.includes("updat")) return "blue";
  return "gray";
};

const getActorInitials = (email: string): string => {
  if (!email) return "S";
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
};

const useDebouncedValue = <T,>(value: T, delayMs: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
};

const ScenarioHistoryExplorer = ({
  scenarioId,
  nodes,
  mode,
  onJumpToNode,
}: ScenarioHistoryExplorerProps) => {
  const [summary, setSummary] = useState<RunHistorySummary | null>(null);
  const [historyRuns, setHistoryRuns] = useState<RunHistoryListItem[]>([]);
  const [historyRunsCount, setHistoryRunsCount] = useState(0);
  const [auditEvents, setAuditEvents] = useState<ScenarioAuditEvent[]>([]);
  const [auditCount, setAuditCount] = useState(0);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedRun, setSelectedRun] = useState<RunSummary | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string>("");
  const [selectedStepInspectorTab, setSelectedStepInspectorTab] =
    useState<StepInspectorTab>("summary");
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatus, setHistoryStatus] = useState("");
  const [historyTriggerType, setHistoryTriggerType] = useState("");
  const [historyProvider, setHistoryProvider] = useState("");
  const [auditSearch, setAuditSearch] = useState("");
  const [auditEventType, setAuditEventType] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingRuns, setIsLoadingRuns] = useState(false);
  const [isLoadingRunDetail, setIsLoadingRunDetail] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [error, setError] = useState("");

  const debouncedHistorySearch = useDebouncedValue(historySearch, 250);
  const debouncedAuditSearch = useDebouncedValue(auditSearch, 250);

  const nodeById = useMemo(() => {
    const mapping = new Map<string, ScenarioNode>();
    nodes.forEach((node) => {
      mapping.set(node.id, node);
    });
    return mapping;
  }, [nodes]);

  const selectedRunSteps = useMemo(() => {
    const steps = selectedRun?.steps;
    if (!Array.isArray(steps)) {
      return [] as RunStepView[];
    }
    return steps.filter((step): step is RunStepView => Boolean(asRecord(step)));
  }, [selectedRun]);

  const selectedStep = useMemo(() => {
    if (!selectedRunSteps.length) {
      return null;
    }
    return (
      selectedRunSteps.find((step, index) => getRunStepId(step, index) === selectedStepId) ||
      selectedRunSteps[0]
    );
  }, [selectedRunSteps, selectedStepId]);

  const selectedStepResolvedNode = useMemo(() => {
    const stepNodeId = String(selectedStep?.node_id || "");
    return stepNodeId ? nodeById.get(stepNodeId) || null : null;
  }, [nodeById, selectedStep]);

  const providerOptions = useMemo(() => {
    const providers = new Set<string>();
    Object.keys(summary?.providers_used || {}).forEach((provider) => providers.add(provider));
    historyRuns.forEach((run) => {
      run.providers_used.forEach((provider) => providers.add(provider));
    });
    return Array.from(providers).sort((left, right) => left.localeCompare(right));
  }, [historyRuns, summary?.providers_used]);

  const auditEventTypeOptions = useMemo(() => {
    const types = new Set<string>();
    auditEvents.forEach((event) => {
      if (event.event_type) {
        types.add(event.event_type);
      }
    });
    return Array.from(types).sort((left, right) => left.localeCompare(right));
  }, [auditEvents]);

  const loadSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const nextSummary = await getScenarioHistorySummary(scenarioId);
      setSummary(nextSummary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load history summary.");
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const loadRuns = async () => {
    setIsLoadingRuns(true);
    try {
      const response = await listScenarioHistoryRuns(scenarioId, {
        status: historyStatus || null,
        trigger_type: historyTriggerType || null,
        provider: historyProvider || null,
        search: debouncedHistorySearch || null,
      });
      setHistoryRuns(response.items);
      setHistoryRunsCount(response.count);
      setSelectedRunId((currentValue) => {
        if (response.items.some((item) => item.id === currentValue)) {
          return currentValue;
        }
        return response.items[0]?.id || null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load run history.");
    } finally {
      setIsLoadingRuns(false);
    }
  };

  const loadRunDetail = async (runId: number) => {
    setIsLoadingRunDetail(true);
    try {
      const nextRun = await getRun(runId);
      setSelectedRun(nextRun);
      const steps = Array.isArray(nextRun.steps)
        ? nextRun.steps.filter((step): step is RunStepView => Boolean(asRecord(step)))
        : [];
      const preferredStep =
        steps.find((step) => getRunStepStatus(step) === "failed") || steps[steps.length - 1] || null;
      setSelectedStepId(preferredStep ? getRunStepId(preferredStep, steps.indexOf(preferredStep)) : "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load run detail.");
    } finally {
      setIsLoadingRunDetail(false);
    }
  };

  const loadAudit = async () => {
    setIsLoadingAudit(true);
    try {
      const response = await listScenarioAuditEvents(scenarioId, {
        event_type: auditEventType || null,
        search: debouncedAuditSearch || null,
      });
      setAuditEvents(response.items);
      setAuditCount(response.count);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load audit events.");
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const refreshCurrentMode = async () => {
    setIsRefreshing(true);
    setError("");
    try {
      await loadSummary();
      if (mode === "history") {
        await loadRuns();
        if (selectedRunId) {
          await loadRunDetail(selectedRunId);
        }
      } else {
        await loadAudit();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setError("");
    void loadSummary();
  }, [scenarioId]);

  useEffect(() => {
    if (mode !== "history") {
      return;
    }
    setError("");
    void loadRuns();
  }, [
    debouncedHistorySearch,
    historyProvider,
    historyStatus,
    historyTriggerType,
    mode,
    scenarioId,
  ]);

  useEffect(() => {
    if (mode !== "history" || !selectedRunId) {
      setSelectedRun(null);
      return;
    }
    setError("");
    void loadRunDetail(selectedRunId);
  }, [mode, selectedRunId]);

  useEffect(() => {
    if (mode !== "audit") {
      return;
    }
    setError("");
    void loadAudit();
  }, [auditEventType, debouncedAuditSearch, mode, scenarioId]);

  const renderSummaryCards = () => {
    const statusCounts = summary?.status_counts || {};
    const summaryCards = [
      {
        label: "Total runs",
        value: String(summary?.total_runs || 0),
        tone: "neutral",
      },
      {
        label: "Success rate",
        value: `${summary?.success_rate || 0}%`,
        tone: "success",
      },
      {
        label: "Avg duration",
        value: formatRunDurationMs(summary?.average_duration_ms || 0),
        tone: "neutral",
      },
      {
        label: "Failed runs",
        value: String(statusCounts.failed || 0),
        tone: "danger",
      },
      {
        label: "Running",
        value: String(statusCounts.running || 0),
        tone: "warning",
      },
      {
        label: "Queued",
        value: String(statusCounts.queued || 0),
        tone: "warning",
      },
    ];

    return (
      <div className="scenario-history-summary-grid">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className={`scenario-history-summary-card scenario-history-summary-card--${card.tone}`}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
    );
  };

  const exportSelectedRunTrace = () => {
    if (!selectedRun) {
      return;
    }
    const blob = new Blob([JSON.stringify(selectedRun, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scenario-run-${selectedRun.id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (
      mode !== "history" ||
      !selectedRunId ||
      !selectedRun ||
      (selectedRun.status !== "queued" && selectedRun.status !== "running")
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      void loadSummary();
      void loadRuns();
      void loadRunDetail(selectedRunId);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [mode, selectedRun, selectedRunId]);

  const renderHistoryMode = () => (
    <div className="scenario-history-layout">
      <aside className="scenario-history-pane scenario-history-pane--list">
        <div className="scenario-history-quick-filters">
          {[
            {
              label: "All runs",
              active:
                !historyStatus && !historyTriggerType && !historyProvider && !historySearch.trim(),
              onClick: () => {
                setHistoryStatus("");
                setHistoryTriggerType("");
                setHistoryProvider("");
                setHistorySearch("");
              },
            },
            {
              label: "Failed runs",
              active: historyStatus === "failed",
              onClick: () => setHistoryStatus("failed"),
            },
            {
              label: "Running now",
              active: historyStatus === "running",
              onClick: () => setHistoryStatus("running"),
            },
            {
              label: "Manual",
              active: historyTriggerType === "manual",
              onClick: () => setHistoryTriggerType("manual"),
            },
            {
              label: "Scheduled",
              active: historyTriggerType === "schedule",
              onClick: () => setHistoryTriggerType("schedule"),
            },
          ].map((filter) => (
            <button
              key={filter.label}
              type="button"
              className={`scenario-history-quick-filter ${
                filter.active ? "scenario-history-quick-filter--active" : ""
              }`}
              onClick={filter.onClick}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="scenario-history-searchbox">
          <Search className="h-4 w-4" />
          <input
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search runs, steps, errors, endpoints, node ids"
          />
        </div>
        <div className="scenario-history-filter-row">
          <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}>
            <option value="">All statuses</option>
            {RUN_STATUS_ORDER.map((statusValue) => (
              <option key={statusValue} value={statusValue}>
                {formatRunLabel(statusValue)}
              </option>
            ))}
          </select>
          <select
            value={historyTriggerType}
            onChange={(event) => setHistoryTriggerType(event.target.value)}
          >
            <option value="">All triggers</option>
            {RUN_TRIGGER_OPTIONS.map((triggerValue) => (
              <option key={triggerValue} value={triggerValue}>
                {formatRunLabel(triggerValue)}
              </option>
            ))}
          </select>
          <select value={historyProvider} onChange={(event) => setHistoryProvider(event.target.value)}>
            <option value="">All providers</option>
            {providerOptions.map((provider) => (
              <option key={provider} value={provider}>
                {formatRunLabel(provider)}
              </option>
            ))}
          </select>
        </div>
        <div className="scenario-history-pane-header">
          <strong>Runs</strong>
          <span>{historyRunsCount}</span>
        </div>
        {isLoadingRuns ? (
          <div className="scenario-history-empty">
            <p>Loading run history...</p>
          </div>
        ) : historyRuns.length ? (
          <div className="scenario-history-run-list">
            {historyRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`scenario-history-run-card ${
                  selectedRunId === run.id ? "scenario-history-run-card--active" : ""
                }`}
                onClick={() => setSelectedRunId(run.id)}
              >
                <div className="scenario-history-run-card-header">
                  <span className={`scenario-run-pill scenario-run-pill--${run.status}`}>
                    {formatRunLabel(run.status)}
                  </span>
                  <span className="scenario-history-run-card-id">Run #{run.id}</span>
                </div>
                <div className="scenario-history-run-card-meta">
                  <span>{formatRunLabel(run.trigger_type)}</span>
                  <span>{formatRunDateTime(run.started_at || run.queued_at || run.created_at)}</span>
                </div>
                <div className="scenario-history-run-card-stats">
                  <span>{formatRunDurationMs(run.duration_ms)}</span>
                  <span>
                    {run.step_counts.succeeded || 0}/{Object.values(run.step_counts).reduce(
                      (sum, value) => sum + Number(value || 0),
                      0
                    )} steps
                  </span>
                </div>
                {run.first_error_message ? (
                  <p className="scenario-history-run-card-error">{run.first_error_message}</p>
                ) : null}
                <div className="scenario-history-provider-tags">
                  {run.providers_used.map((provider) => (
                    <span key={`${run.id}-${provider}`} className="scenario-history-provider-tag">
                      {formatRunLabel(provider)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="scenario-history-empty">
            <strong>No runs matched this view.</strong>
            <p>Try widening the search, filters, or time window.</p>
          </div>
        )}
      </aside>

      <section className="scenario-history-pane scenario-history-pane--timeline">
        {selectedRun ? (
          <>
            <div className="scenario-history-run-header">
              <div>
                <h3>Run #{selectedRun.id}</h3>
                <p>
                  {formatRunLabel(selectedRun.trigger_type)} trigger •
                  {" "}
                  {formatRunDateTime(selectedRun.started_at || selectedRun.queued_at || selectedRun.created_at)}
                </p>
              </div>
              <div className="scenario-history-run-header-badges">
                <span className={`scenario-run-pill scenario-run-pill--${selectedRun.status}`}>
                  {formatRunLabel(selectedRun.status)}
                </span>
                <span className="scenario-history-run-header-meta">
                  <Clock3 className="h-4 w-4" />
                  {formatRunDurationMs(
                    selectedRun.started_at && selectedRun.ended_at
                      ? new Date(selectedRun.ended_at).getTime() -
                          new Date(selectedRun.started_at).getTime()
                      : 0
                  )}
                </span>
              </div>
            </div>

            <div className="scenario-history-step-timeline">
              {isLoadingRunDetail ? (
                <div className="scenario-history-empty">
                  <p>Loading run steps...</p>
                </div>
              ) : selectedRunSteps.length ? (
                selectedRunSteps.map((step, index) => {
                  const stepId = getRunStepId(step, index);
                  const stepStatus = getRunStepStatus(step);
                  const nodeId = String(step.node_id || "");
                  const linkedNode = nodeById.get(nodeId);
                  const errorMessage = getRunStepErrorMessage(step);
                  return (
                    <article
                      key={stepId}
                      className={`scenario-history-step-card ${
                        selectedStepId === stepId ? "scenario-history-step-card--active" : ""
                      } scenario-history-step-card--${stepStatus}`}
                    >
                      <div className="scenario-history-step-card-header">
                        <span className="scenario-history-step-index">Step {index + 1}</span>
                        <div className="scenario-history-step-card-actions">
                          <span className={`scenario-run-step-badge scenario-run-step-badge--${stepStatus}`}>
                            {formatRunLabel(stepStatus)}
                          </span>
                          {nodeId && onJumpToNode ? (
                            <button
                              type="button"
                              className="scenario-history-step-jump"
                              onClick={() => onJumpToNode(nodeId)}
                            >
                              <ArrowUpRight className="h-4 w-4" />
                              Jump to node
                            </button>
                          ) : null}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="scenario-history-step-select"
                        onClick={() => {
                          setSelectedStepId(stepId);
                          if (stepStatus === "failed") {
                            setSelectedStepInspectorTab("error");
                          } else {
                            setSelectedStepInspectorTab("summary");
                          }
                        }}
                      >
                        <strong>{linkedNode?.title || String(step.node_type || nodeId || stepId)}</strong>
                        <p>{getStepSummaryLine(step)}</p>
                        <div className="scenario-history-step-meta">
                          <span>{nodeId || "Unknown node"}</span>
                          <span>{formatRunDurationMs(step.duration_ms)}</span>
                        </div>
                        {errorMessage ? (
                          <p className="scenario-history-step-error">{errorMessage}</p>
                        ) : null}
                      </button>
                    </article>
                  );
                })
              ) : (
                <div className="scenario-history-empty">
                  <strong>No structured steps captured.</strong>
                  <p>This run may still be queued, running, or may have failed before node execution.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="scenario-history-empty">
            <strong>Select a run to inspect it.</strong>
            <p>Runs will appear here as soon as the scenario has execution history.</p>
          </div>
        )}
      </section>

      <aside className="scenario-history-pane scenario-history-pane--inspector">
        <div className="scenario-history-pane-header">
          <strong>Inspector</strong>
          {selectedStepResolvedNode ? <span>{selectedStepResolvedNode.title}</span> : null}
        </div>
        {selectedStep ? (
          <>
            <div className="scenario-history-inspector-tabs">
              {(["summary", "input", "output", "error"] as StepInspectorTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`scenario-history-inspector-tab ${
                    selectedStepInspectorTab === tab ? "scenario-history-inspector-tab--active" : ""
                  }`}
                  onClick={() => setSelectedStepInspectorTab(tab)}
                >
                  {formatRunLabel(tab)}
                </button>
              ))}
            </div>
            {selectedStepInspectorTab === "summary" ? (
              <div className="scenario-history-inspector-summary">
                <dl>
                  <div>
                    <dt>Status</dt>
                    <dd>{formatRunLabel(selectedStep.status || "unknown")}</dd>
                  </div>
                  <div>
                    <dt>Node id</dt>
                    <dd>{String(selectedStep.node_id || "n/a")}</dd>
                  </div>
                  <div>
                    <dt>Node type</dt>
                    <dd>{String(selectedStep.node_type || "n/a")}</dd>
                  </div>
                  <div>
                    <dt>Duration</dt>
                    <dd>{formatRunDurationMs(selectedStep.duration_ms)}</dd>
                  </div>
                  <div>
                    <dt>Started</dt>
                    <dd>{formatRunDateTime(selectedStep.started_at)}</dd>
                  </div>
                  <div>
                    <dt>Ended</dt>
                    <dd>{formatRunDateTime(selectedStep.ended_at)}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
            {selectedStepInspectorTab === "input" ? (
              <pre className="scenario-history-json-block">
                {JSON.stringify(selectedStep.input_json || {}, null, 2)}
              </pre>
            ) : null}
            {selectedStepInspectorTab === "output" ? (
              <pre className="scenario-history-json-block">
                {JSON.stringify(
                  selectedStep.output_raw_json || selectedStep.output_normalized_json || {},
                  null,
                  2
                )}
              </pre>
            ) : null}
            {selectedStepInspectorTab === "error" ? (
              <pre className="scenario-history-json-block">
                {JSON.stringify(selectedStep.error_json || {}, null, 2)}
              </pre>
            ) : null}
          </>
        ) : (
          <div className="scenario-history-empty">
            <strong>Select a step to inspect it.</strong>
            <p>The right pane shows structured input, output, and errors for the selected step.</p>
          </div>
        )}
      </aside>
    </div>
  );

  const renderAuditMode = () => (
    <div className="scenario-audit-layout">
      <div className="scenario-audit-toolbar">
        <div className="scenario-history-searchbox scenario-audit-searchbox">
          <Search className="h-4 w-4" />
          <input
            value={auditSearch}
            onChange={(event) => setAuditSearch(event.target.value)}
            placeholder="Search events, labels, actor emails, payload…"
          />
        </div>
        <select
          className="scenario-audit-filter-select"
          value={auditEventType}
          onChange={(event) => setAuditEventType(event.target.value)}
        >
          <option value="">All event types</option>
          {auditEventTypeOptions.map((eventTypeValue) => (
            <option key={eventTypeValue} value={eventTypeValue}>
              {formatRunLabel(eventTypeValue)}
            </option>
          ))}
        </select>
      </div>

      <div className="scenario-audit-panel">
        <div className="scenario-audit-section-header">
          <span className="scenario-audit-section-title">Audit events</span>
          <span className="scenario-audit-count-pill">{auditCount}</span>
        </div>

        {isLoadingAudit ? (
          <div className="scenario-history-empty">
            <p>Loading audit history…</p>
          </div>
        ) : auditEvents.length ? (
          <div className="scenario-audit-event-list">
            {auditEvents.map((event) => {
              const tone = getAuditEventTone(event.event_type);
              const initials = getActorInitials(event.actor_email || "");
              return (
                <article key={event.id} className={`scenario-audit-event scenario-audit-event--${tone}`}>
                  <div className="scenario-audit-event-avatar">{initials}</div>
                  <div className="scenario-audit-event-body">
                    <div className="scenario-audit-event-topline">
                      <span className={`scenario-audit-event-badge scenario-audit-event-badge--${tone}`}>
                        {formatRunLabel(event.event_type)}
                      </span>
                      <time className="scenario-audit-event-time">{formatRunDateTime(event.created_at)}</time>
                    </div>
                    <strong className="scenario-audit-event-label">{event.event_label}</strong>
                    <p className="scenario-audit-event-actor">
                      {event.actor_email || "System"}
                      {event.run_id ? (
                        <span className="scenario-audit-event-run-link">&nbsp;· Run #{event.run_id}</span>
                      ) : null}
                    </p>
                    {event.payload_json && Object.keys(event.payload_json).length ? (
                      <pre className="scenario-history-json-block scenario-audit-payload">
                        {JSON.stringify(event.payload_json, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="scenario-audit-empty">
            <ShieldCheck className="scenario-audit-empty-icon" strokeWidth={1.5} />
            <strong>No audit events matched this view.</strong>
            <p>Scenario changes such as publish, activate, or schedule edits will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section className="scenario-history-explorer">
      <div className="scenario-history-toolbar">
        <div>
          <h2>{mode === "history" ? "History Explorer" : "Scenario Audit"}</h2>
          <p>
            {mode === "history"
              ? "Search across runs, steps, providers, errors, and node outputs."
              : "Track scenario changes, publish actions, schedule edits, and manual run requests."}
          </p>
        </div>
        <div className="scenario-history-toolbar-actions">
          {mode === "history" && selectedRun ? (
            <MLButton type="button" variant="outline" onClick={exportSelectedRunTrace}>
              Export trace
            </MLButton>
          ) : null}
          <MLButton
            type="button"
            variant="outline"
            onClick={() => void refreshCurrentMode()}
            disabled={isRefreshing}
          >
            <RefreshCw
              className={
                isRefreshing ? "h-4 w-4 scenario-run-output-action-icon--spinning" : "h-4 w-4"
              }
            />
            Refresh
          </MLButton>
        </div>
      </div>

      {isLoadingSummary ? (
        <div className="scenario-history-empty">
          <p>Loading execution summary...</p>
        </div>
      ) : (
        renderSummaryCards()
      )}

      {error ? <p className="scenario-config-error">{error}</p> : null}

      {mode === "history" ? renderHistoryMode() : renderAuditMode()}
    </section>
  );
};

export default ScenarioHistoryExplorer;
