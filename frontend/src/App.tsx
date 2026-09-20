import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchEmailDetail,
  fetchEmails,
  fetchReviewQueue,
  resolveReviewItem,
  createCase,
  type EmailDetail,
  type EmailListItem,
  type ReviewQueueItem,
} from "./api";
import { Icon, IconSprite } from "./components/IconSprite";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { MetricsRow } from "./components/MetricsRow";
import { CaseTable } from "./components/CaseTable";
import { ActivityPanel } from "./components/ActivityPanel";
import { PlaceholderView } from "./components/PlaceholderView";
import { AnalyticsView } from "./components/AnalyticsView";
import { ReviewQueueView } from "./components/ReviewQueueView";
import { CaseModal } from "./components/CaseModal";
import { Toast } from "./components/Toast";
import { NewCaseModal } from "./components/NewCaseModal";

export type View =
  | "dashboard"
  | "inbox"
  | "review"
  | "reports"
  | "analytics"
  | "settings";

const VIEW_TITLE: Record<View, string> = {
  dashboard: "",
  inbox: "Inbox",
  review: "Review queue",
  reports: "Reports",
  analytics: "Analytics",
  settings: "Settings",
};

function greeting(): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}.`;
}

function today(): string {
  return new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}

function App() {
  const [emails, setEmails] = useState<EmailListItem[]>([]);
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [creatingCase, setCreatingCase] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [modalEmailId, setModalEmailId] = useState<string | null>(null);
  const [modalDetail, setModalDetail] = useState<EmailDetail | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    Promise.all([fetchEmails(), fetchReviewQueue()])
      .then(([emailList, queue]) => {
        setEmails(emailList);
        setReviewQueue(queue);
      })
      .catch((error: Error) => setLoadError(error.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!modalEmailId) return;
    setModalDetail(null);
    setModalError(null);
    setModalLoading(true);
    fetchEmailDetail(modalEmailId)
      .then(setModalDetail)
      .catch((error: Error) => setModalError(error.message))
      .finally(() => setModalLoading(false));
  }, [modalEmailId]);

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

  const handleResolve = async (emailId: string, resolution: string) => {
    const updated = await resolveReviewItem(emailId, resolution);
    setReviewQueue(updated);
    showToast("Review item resolved");
  };

  const handleCreateCase = async (input: { subject: string; sender: string; body: string; files: File[] }) => {
    setCreatingCase(true);
    setCreateError(null);
    try {
      const id = await createCase(input);
      const [emailList, queue] = await Promise.all([fetchEmails(), fetchReviewQueue()]);
      setEmails(emailList);
      setReviewQueue(queue);
      setNewCaseOpen(false);
      showToast(`Case ${id.slice(0, 8)} created`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Could not create the case.");
      // The database insert may have succeeded before a classifier error.
      fetchEmails().then(setEmails).catch(() => undefined);
    } finally {
      setCreatingCase(false);
    }
  };

  return (
    <>
      <IconSprite />
      <div className="app-shell">
        <Sidebar
          view={view}
          onNavigate={handleNavigate}
          open={sidebarOpen}
          inboxCount={emails.length}
          reviewCount={pendingReviewCount}
        />

        <main className="main">
          <Topbar
            eyebrow={view === "dashboard" ? today() : "DocWise workspace"}
            title={view === "dashboard" ? greeting() : VIEW_TITLE[view]}
            search={search}
            onSearchChange={setSearch}
            searchEnabled={view === "dashboard" || view === "inbox"}
            onMenuClick={() => setSidebarOpen((open) => !open)}
            onNewCase={() => { setCreateError(null); setNewCaseOpen(true); }}
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
                  onOpen={setModalEmailId}
                  search={search}
                  showFilter
                  pageSize={8}
                  onViewMore={() => handleNavigate("inbox")}
                />
                <ActivityPanel />
              </div>
            </section>
          )}

          {!loading && !loadError && view === "inbox" && (
            <section className="view active">
              <CaseTable emails={emails} onOpen={setModalEmailId} search={search} showFilter paginate pageSize={10} />
            </section>
          )}

          {!loading && !loadError && view === "review" && (
            <section className="view active">
              <ReviewQueueView items={reviewQueue} onOpen={setModalEmailId} onResolve={handleResolve} />
            </section>
          )}

          {!loading && !loadError && view === "analytics" && (
            <AnalyticsView emails={emails} reviewQueue={reviewQueue} />
          )}

          {!loading && !loadError && (view === "reports" || view === "settings") && (
            <PlaceholderView view={view} />
          )}
        </main>
      </div>

      <CaseModal
        open={modalEmailId !== null}
        detail={modalDetail}
        loading={modalLoading}
        error={modalError}
        onClose={() => setModalEmailId(null)}
      />

      <NewCaseModal
        open={newCaseOpen}
        saving={creatingCase}
        error={createError}
        onClose={() => setNewCaseOpen(false)}
        onSubmit={handleCreateCase}
      />

      <Toast message={toastMessage} />
    </>
  );
}

export default App;
