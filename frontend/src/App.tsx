import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchEmailDetail,
  fetchEmails,
  fetchReviewQueue,
  resolveReviewItem,
  type EmailDetail,
  type EmailListItem,
  type ReviewQueueItem,
} from "./api";
import { IconSprite } from "./components/IconSprite";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { MetricsRow } from "./components/MetricsRow";
import { CaseTable } from "./components/CaseTable";
import { ActivityPanel } from "./components/ActivityPanel";
import { PlaceholderView } from "./components/PlaceholderView";
import { ReviewQueueView } from "./components/ReviewQueueView";
import { CaseModal } from "./components/CaseModal";
import { Toast } from "./components/Toast";
import { ClassifierLabView } from "./components/ClassifierLabView";

export type View =
  | "dashboard"
  | "inbox"
  | "review"
  | "classifier-lab"
  | "reports"
  | "analytics"
  | "settings";

const VIEW_TITLE: Record<View, string> = {
  dashboard: "",
  inbox: "Inbox",
  review: "Review queue",
  "classifier-lab": "Classifier lab",
  reports: "Reports",
  analytics: "Analytics",
  settings: "Settings",
};

function greeting(): string {
  const hour = new Date().getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `Good ${part}, Maya.`;
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
  const [loadError, setLoadError] = useState<string | null>(null);

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
      .catch((error: Error) => setLoadError(error.message));
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

  const sampleCaseId = useMemo(() => {
    const firstMismatch = emails.find((e) => e.status === "MISMATCH");
    return firstMismatch?.id ?? emails[0]?.id ?? null;
  }, [emails]);

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
            eyebrow={view === "dashboard" ? today() : "LADING workspace"}
            title={view === "dashboard" ? greeting() : VIEW_TITLE[view]}
            search={search}
            onSearchChange={setSearch}
            searchEnabled={view === "dashboard" || view === "inbox"}
            onMenuClick={() => setSidebarOpen((open) => !open)}
          />

          {loadError && <div className="panel" style={{ padding: 24, color: "var(--red)" }}>Failed to load: {loadError}</div>}

          {!loadError && view === "dashboard" && (
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

          {!loadError && view === "inbox" && (
            <section className="view active">
              <CaseTable emails={emails} onOpen={setModalEmailId} search={search} showFilter paginate pageSize={10} />
            </section>
          )}

          {!loadError && view === "review" && (
            <section className="view active">
              <ReviewQueueView items={reviewQueue} onOpen={setModalEmailId} onResolve={handleResolve} />
            </section>
          )}

          {!loadError && view === "classifier-lab" && (
            <section className="view active">
              <ClassifierLabView />
            </section>
          )}

          {!loadError && (view === "reports" || view === "analytics" || view === "settings") && (
            <PlaceholderView view={view} onOpenSample={() => sampleCaseId && setModalEmailId(sampleCaseId)} />
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

      <Toast message={toastMessage} />
    </>
  );
}

export default App;
