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
import { InsightsRail } from "./components/InsightsRail";
import { PlaceholderView } from "./components/PlaceholderView";
import { SettingsView } from "./components/SettingsView";
import { AnalyticsView } from "./components/AnalyticsView";
import { ReviewQueueView } from "./components/ReviewQueueView";
import { CaseModal } from "./components/CaseModal";
import { Toast } from "./components/Toast";
import { ClassifierLabView } from "./components/ClassifierLabView";
import { GuideView } from "./components/GuideView";

export type View =
  | "dashboard"
  | "inbox"
  | "review"
  | "classifier-lab"
  | "reports"
  | "analytics"
  | "guide"
  | "settings";

type Theme = "light" | "dark";

const VIEW_META: Record<Exclude<View, "dashboard">, [string, string]> = {
  inbox: ["Inbox", "Every classified email across the shared shipping mailbox."],
  review: ["Review queue", "Cases the pipeline escalated because it could not decide."],
  "classifier-lab": ["Classifier lab", "Test the email-intent classifier one message at a time."],
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
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [view, setView] = useState<View>("dashboard");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(
    () => readStored<"expanded" | "collapsed">("docwise.sidebar", "expanded") === "collapsed",
  );
  const [theme, setTheme] = useState<Theme>(() => readStored<Theme>("docwise.theme", "light"));
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

  const [title, subtitle] =
    view === "dashboard"
      ? [greeting(), today()]
      : VIEW_META[view];

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
            searchEnabled={view === "dashboard" || view === "inbox"}
            onMenuClick={() => setSidebarOpen((open) => !open)}
            onNewCase={() => handleNavigate("classifier-lab")}
          />

          {loadError && (
            <div className="panel" style={{ padding: 24, color: "var(--red)" }}>
              Failed to load: {loadError}
            </div>
          )}

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
                <InsightsRail emails={emails} reviewQueue={reviewQueue} />
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

          {!loadError && view === "analytics" && (
            <AnalyticsView emails={emails} reviewQueue={reviewQueue} />
          )}

          {!loadError && view === "guide" && <GuideView onNavigate={handleNavigate} />}

          {!loadError && view === "settings" && (
            <SettingsView theme={theme} onThemeChange={setTheme} />
          )}

          {!loadError && view === "reports" && <PlaceholderView view={view} />}
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
