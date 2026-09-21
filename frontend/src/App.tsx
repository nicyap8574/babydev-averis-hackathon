import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchEmailDetail,
  fetchReportDetail,
  fetchEmails,
  fetchReviewQueue,
  resolveReviewItem,
  createCase,
  setEmailsArchived,
  type EmailDetail,
  type EmailListItem,
  type ReviewQueueItem,
} from "./api";
import { Icon, IconSprite } from "./components/IconSprite";
import { categoryLabel } from "./components/CategoryPill";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { MetricsRow } from "./components/MetricsRow";
import { CaseTable } from "./components/CaseTable";
import { InsightsRail } from "./components/InsightsRail";
import { SettingsView } from "./components/SettingsView";
import { AnalyticsView } from "./components/AnalyticsView";
import { ReviewQueueView } from "./components/ReviewQueueView";
import { ReportsView } from "./components/ReportsView";
import { CaseModal } from "./components/CaseModal";
import { Toast } from "./components/Toast";
import { GuideView } from "./components/GuideView";
import { NewCaseModal } from "./components/NewCaseModal";
import { BatchUploadModal } from "./components/BatchUploadModal";
import { ingestBundle, type BatchProgress, type BatchResult } from "./lib/batchIngest";

export type View =
  | "dashboard"
  | "inbox"
  | "review"
  | "archived"
  | "reports"
  | "analytics"
  | "guide"
  | "settings";

type Theme = "light" | "dark";

const VIEW_META: Record<Exclude<View, "dashboard">, [string, string]> = {
  inbox: ["Inbox", "Every classified email across the shared shipping mailbox."],
  review: ["Review queue", "Cases the pipeline escalated because it could not decide."],
  archived: ["Archived", "Cases you've removed from the active inbox view."],
  reports: ["Reports", "Completed discrepancy reports and reviewer history."],
  analytics: ["Analytics", "Classification and defect distribution across the run."],
  guide: ["Help & guide", "A walkthrough of DocWise in the order you will use it."],
  settings: ["Settings", "Field aliases, comparison tolerance, and model routing."],
};

function greeting(): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, BabyDevs`;
}

function today(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function readStored<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T | null) ?? fallback;
  } catch {
    return fallback;
  }
}

function App() {
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [archivedEmails, setArchivedEmails] = useState<EmailListItem[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => readStored<"expanded" | "collapsed">("docwise.sidebar", "expanded") === "collapsed",
  );
  const [theme, setTheme] = useState<Theme>(() => readStored<Theme>("docwise.theme", "light"));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createNotice, setCreateNotice] = useState<string | null>(null);

  const [batchOpen, setBatchOpen] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const [modalEmailId, setModalEmailId] = useState<string | null>(null);
  const [modalKind, setModalKind] = useState<"case" | "report">("case");
  const [modalDetail, setModalDetail] = useState<EmailDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    Promise.all([fetchEmails(), fetchEmails({ archived: true }), fetchReviewQueue()])
      .then(([emailList, archivedList, queue]) => {
        setEmails(emailList);
        setArchivedEmails(archivedList);
        setReviewQueue(queue);
      })
      .catch((error: Error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("docwise.theme", theme);
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("docwise.sidebar", collapsed ? "collapsed" : "expanded");
    } catch {
      /* private mode — the collapse state just won't persist */
    }
  }, [collapsed]);

  useEffect(() => {
    if (!modalEmailId) return;
    setModalDetail(null);
    setModalError(null);
    setModalLoading(true);
    const loadDetail = modalKind === "report" ? fetchReportDetail : fetchEmailDetail;
    loadDetail(modalEmailId)
      .then(setModalDetail)
      .catch((error: Error) => setModalError(error.message))
      .finally(() => setModalLoading(false));
  }, [modalEmailId, modalKind]);

  useEffect(() => {
    document.body.style.overflow = modalEmailId ? "hidden" : "";
  }, [modalEmailId]);

  useEffect(() => {
    if (!modalEmailId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModalEmailId(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [modalEmailId]);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), 2400);
  };

  const pendingReviewCount = useMemo(
    () => reviewQueue.filter((item) => !item.resolved).length,
    [reviewQueue],
  );

  const handleNavigate = (next: View) => {
    setView(next);
    setSidebarOpen(false);
    setSearch("");
  };

  const openCase = (emailId: string) => {
    setModalKind("case");
    setModalEmailId(emailId);
  };

  const openReport = (emailId: string) => {
    setModalKind("report");
    setModalEmailId(emailId);
  };

  const closeModal = () => {
    setModalEmailId(null);
    setModalKind("case");
  };

  const handleResolve = async (emailId: string, resolution: string) => {
    const updated = await resolveReviewItem(emailId, resolution);
    setReviewQueue(updated);
    showToast("Review item resolved");
  };

  const handleArchive = async (emailIds: string[], archive: boolean) => {
    try {
      await setEmailsArchived(emailIds, archive);
      const [emailList, archivedList] = await Promise.all([
        fetchEmails(),
        fetchEmails({ archived: true }),
      ]);
      setEmails(emailList);
      setArchivedEmails(archivedList);
      const count = emailIds.length;
      showToast(
        archive
          ? `${count} case${count === 1 ? "" : "s"} archived`
          : `${count} case${count === 1 ? "" : "s"} restored`,
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not update the archive.");
    }
  };

  const [title, subtitle] =
    view === "dashboard"
      ? [greeting(), today()]
      : VIEW_META[view];

  const handleCreateCase = async (input: { subject: string; sender: string; body: string; files: File[] }) => {
    setCreatingCase(true);
    setCreateError(null);
    setCreateNotice(null);
    try {
      const created = await createCase(input);
      const [emailList, queue] = await Promise.all([fetchEmails(), fetchReviewQueue()]);
      setEmails(emailList);
      setReviewQueue(queue);
      if (created.comparisonError) {
        setCreateError(`Case created and classified, but the comparison could not run: ${created.comparisonError}`);
        return;
      }
      if (!created.comparisonRun) {
        // A non-comparison category is a correct outcome, not a failure — but
        // closing on a success toast would leave no trace of why no SI/BL
        // verdict appeared.
        const label = created.category ? categoryLabel(created.category) : "an unrecognised category";
        setCreateNotice(
          `Case created and classified as ${label}. SI/BL comparison runs only for BL Comparison emails, so no verdict was produced.`,
        );
        return;
      }
      setNewCaseOpen(false);
      showToast(`Case ${created.emailId.slice(0, 8)} created — comparison complete`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create the case.");
      // The database insert may have succeeded before a classifier error.
      fetchEmails().then(setEmails).catch(() => undefined);
    } finally {
      setCreatingCase(false);
    }
  };

  const handleBatchUpload = async (file: File) => {
    setBatchRunning(true);
    setBatchError(null);
    setBatchResult(null);
    setBatchProgress(null);
    try {
      const result = await ingestBundle(file, setBatchProgress);
      setBatchResult(result);
      showToast(`${result.ingested} of ${result.total} cases ingested`);
    } catch (error) {
      setBatchError(error instanceof Error ? error.message : "Could not ingest the bundle.");
    } finally {
      setBatchRunning(false);
      // Rows may have landed even on a partial failure, so refresh either way.
      Promise.all([fetchEmails(), fetchReviewQueue()])
        .then(([emailList, queue]) => {
          setEmails(emailList);
          setReviewQueue(queue);
        })
        .catch(() => undefined);
    }
  };

  return (
    <>
      <IconSprite />
      <div className={`app-shell${collapsed ? " collapsed" : ""}`}>
        <Sidebar
          view={view}
          onNavigate={handleNavigate}
          open={sidebarOpen}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((value) => !value)}
          inboxCount={emails.length}
          reviewCount={pendingReviewCount}
          archivedCount={archivedEmails.length}
        />
        {sidebarOpen && (
          <button
            className="sidebar-scrim"
            aria-label="Close menu"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="main">
          <Topbar
            title={title}
            subtitle={subtitle}
            search={search}
            onSearchChange={setSearch}
            searchEnabled={
              view === "dashboard" || view === "inbox" || view === "archived" || view === "reports"
            }
            onMenuClick={() => setSidebarOpen((open) => !open)}
            onNewCase={() => { setCreateError(null); setCreateNotice(null); setNewCaseOpen(true); }}
            onBatchUpload={() => {
              setBatchError(null);
              setBatchResult(null);
              setBatchProgress(null);
              setBatchOpen(true);
            }}
          />

          {loading && (
            <section className="panel workspace-state" role="status">
              <span className="metric-icon"><Icon id="i-inbox" /></span>
              <strong>Loading your workspace</strong>
              <span>Connecting to your inbox and review queue…</span>
            </section>
          )}

          {loadError && (
            <section className="panel workspace-state" role="alert">
              <span className="metric-icon"><Icon id="i-info" /></span>
              <strong>
                {loadError.startsWith("Supabase is not configured.")
                  ? "Connect your Supabase workspace"
                  : "Couldn’t load your workspace"}
              </strong>
              <span>{loadError}</span>
            </section>
          )}

          {!loading && !loadError && view === "dashboard" && (
            <section className="view active">
              <MetricsRow emails={emails} reviewQueue={reviewQueue} />
              <div className="dashboard-grid">
                <CaseTable
                  emails={emails}
                  onOpen={openCase}
                  search={search}
                  showFilter
                  pageSize={8}
                  onViewMore={() => handleNavigate("inbox")}
                />
                <InsightsRail emails={emails} reviewQueue={reviewQueue} />
              </div>
            </section>
          )}

          {!loading && !loadError && view === "inbox" && (
            <section className="view active">
              <CaseTable
                emails={emails}
                onOpen={openCase}
                search={search}
                showFilter
                paginate
                pageSize={10}
                onArchive={handleArchive}
              />
            </section>
          )}

          {!loading && !loadError && view === "archived" && (
            <section className="view active">
              <CaseTable
                emails={archivedEmails}
                onOpen={openCase}
                search={search}
                showFilter
                paginate
                pageSize={10}
                onArchive={handleArchive}
                archived
                heading="Archived cases"
                description="Cases removed from the active inbox view."
                emptyMessage="No archived cases yet."
              />
            </section>
          )}

          {!loading && !loadError && view === "review" && (
            <section className="view active">
              <ReviewQueueView items={reviewQueue} onOpen={openCase} onResolve={handleResolve} />
            </section>
          )}

          {!loading && !loadError && view === "analytics" && (
            <AnalyticsView emails={emails} reviewQueue={reviewQueue} />
          )}

          {!loadError && view === "guide" && <GuideView onNavigate={handleNavigate} />}

          {!loadError && view === "settings" && (
            <SettingsView theme={theme} onThemeChange={setTheme} />
          )}

          {!loading && !loadError && view === "reports" && <ReportsView search={search} onOpen={openReport} />}
        </main>
      </div>

      <CaseModal
        open={modalEmailId !== null}
        detail={modalDetail}
        loading={modalLoading}
        error={modalError}
        onClose={closeModal}
      />

      {/* Rendered only while open so each run starts from a blank form —
          a mounted-but-hidden modal keeps its previous fields and files. */}
      {newCaseOpen && (
        <NewCaseModal
          saving={creatingCase}
          error={createError}
          notice={createNotice}
          onClose={() => setNewCaseOpen(false)}
          onSubmit={handleCreateCase}
        />
      )}

      {batchOpen && (
        <BatchUploadModal
          running={batchRunning}
          progress={batchProgress}
          result={batchResult}
          error={batchError}
          onClose={() => setBatchOpen(false)}
          onSubmit={handleBatchUpload}
        />
      )}

      <Toast message={toastMessage} />
    </>
  );
}

export default App;
