import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useParams,
} from "react-router-dom";

import {
  AuthProvider,
  useAuth,
} from "./context/AuthContext";

import Login from "./pages/Login";
import Register from "./pages/Register";
import { DashboardProvider } from "./context/DashboardContext";

// Every other page is loaded only when it is opened (code splitting).
// Before, the whole app - including the heavy face / eye detection
// library - was downloaded on the login page.
const Welcome = lazy(() => import("./pages/Welcome"));
const DashboardLayout = lazy(() => import("./components/dashboard/DashboardLayout"));
const Overview = lazy(() => import("./pages/dashboard/Overview"));
const Assessments = lazy(() => import("./pages/dashboard/Assessments"));
const Analytics = lazy(() => import("./pages/dashboard/Analytics"));
const Configuration = lazy(() => import("./pages/dashboard/Configuration"));
const Profile = lazy(() => import("./pages/dashboard/Profile"));
const Help = lazy(() => import("./pages/dashboard/Help"));
const CandidateDetail = lazy(() => import("./pages/dashboard/CandidateDetail"));
const InterviewControls = lazy(() => import("./pages/dashboard/InterviewControls"));
const Scheduling = lazy(() => import("./pages/dashboard/Scheduling"));
const Transcripts = lazy(() => import("./pages/dashboard/Transcripts"));
const Reports = lazy(() => import("./pages/dashboard/Reports"));
const LiveGuard = lazy(() => import("./features/live-guard")); // Live Interview Guard (separate feature)
const CreateInterview = lazy(() => import("./pages/CreateInterview"));
const InterviewConfiguration = lazy(() => import("./pages/InterviewConfiguration"));
const InterviewLobby = lazy(() => import("./pages/InterviewLobby"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const InterviewSession = lazy(() => import("./pages/InterviewSession"));
const MonitoringSetup = lazy(() => import("./pages/MonitoringSetup"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-[#f5f7fa] flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-brand-500 animate-spin" />
    </div>
  );
}

// ============================================================
// PROTECTED ROUTE
// ============================================================

// Not signed in: every app page (dashboard, interviews, reports ...)
// asks to log in first. After login the user is taken back to the page
// they wanted. The app itself always opens on the Welcome page ("/").
function LoginFirst() {
  const location = useLocation();
  return (
    <Navigate
      to="/login"
      replace
      state={{ from: location.pathname + location.search }}
    />
  );
}

function ProtectedRoute({ children }) {
  const { user } = useAuth();

  // User is not logged in
  if (!user) {
    return <LoginFirst />;
  }

  // User is logged in
  return children;
}

// ============================================================
// RECRUITER ROUTE (candidates are sent back to their dashboard)
// ============================================================

function RecruiterRoute({ children }) {
  const { user } = useAuth();

  if (!user) {
    return <LoginFirst />;
  }

  if (user.role === "candidate") {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

  return children;
}

// ============================================================
// OLD REPORT URL -> interviewer candidate page
// (reports are for the interviewer only)
// ============================================================

function ReportRedirect() {
  const { sessionId } = useParams();

  return (
    <Navigate
      to={`/dashboard/candidates/${sessionId}`}
      replace
    />
  );
}

// ============================================================
// INTERVIEW ENDED PAGE
// ============================================================

function InterviewEnded() {
  return (
    <div className="min-h-screen bg-[#f5f7fa] text-navy-900 flex items-center justify-center px-6">
      <div className="ui-card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-2xl">⏹</div>
        <h1 className="text-2xl font-bold mb-3">
          Interview Ended
        </h1>

        <p className="text-slate-500">
          The interview was ended because you left the interview page. Please contact the interviewer if this was a mistake.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// APP ROUTES
// ============================================================

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Routes>

      {/* ======================================================
          DEFAULT ROUTE
      ====================================================== */}

      {/* The app opens here: Welcome page with Log in / Register.
          Dashboard & interview pages need a login first. */}
      <Route path="/" element={<Welcome />} />
      <Route path="/welcome" element={<Welcome />} />

      {/* ======================================================
          AUTHENTICATION
      ====================================================== */}

      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      {/* ======================================================
          INVITATION LINK  (button in the invitation e-mail)
          /invite/INV-XXXX-XXXX -> checks the ID -> opens ONLY
          that interview. Handles its own login redirect.
      ====================================================== */}

      <Route
        path="/invite/:code"
        element={<InviteAccept />}
      />

      {/* ======================================================
          DASHBOARD
      ====================================================== */}

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardProvider>
              <DashboardLayout />
            </DashboardProvider>
          </ProtectedRoute>
        }
      >
        <Route index element={<Overview />} />
        <Route path="assessments" element={<Assessments />} />
        <Route path="analytics" element={<Analytics />} />
        <Route path="configuration" element={<Configuration />} />
        <Route path="profile" element={<Profile />} />
        <Route path="help" element={<Help />} />
        {/* Removed pages (Candidates, Interview Sessions, Live Monitoring) -> old links open Reports */}
        <Route path="candidates" element={<Navigate to="/dashboard/reports" replace />} />
        <Route
          path="candidates/:sessionId"
          element={
            <RecruiterRoute>
              <CandidateDetail />
            </RecruiterRoute>
          }
        />
        <Route
          path="controls"
          element={
            <RecruiterRoute>
              <InterviewControls />
            </RecruiterRoute>
          }
        />
        {/* New pages (redesign) – built on the existing /hiring APIs */}
        <Route
          path="scheduling"
          element={
            <RecruiterRoute>
              <Scheduling />
            </RecruiterRoute>
          }
        />
        <Route path="sessions" element={<Navigate to="/dashboard/reports" replace />} />
        {/* Live Monitoring was replaced by Live Interview Guard */}
        <Route path="monitoring" element={<Navigate to="/dashboard/live-guard" replace />} />
        <Route
          path="live-guard"
          element={
            <RecruiterRoute>
              <LiveGuard />
            </RecruiterRoute>
          }
        />
        <Route
          path="transcripts"
          element={
            <RecruiterRoute>
              <Transcripts />
            </RecruiterRoute>
          }
        />
        <Route
          path="reports"
          element={
            <RecruiterRoute>
              <Reports />
            </RecruiterRoute>
          }
        />
        {/* Client Settings was merged into Interview Controls */}
        <Route path="client-settings" element={<Navigate to="/dashboard/controls" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* ======================================================
          INTERVIEWER
      ====================================================== */}

      <Route
        path="/create-interview"
        element={
          <RecruiterRoute>
            <CreateInterview />
          </RecruiterRoute>
        }
      />

      <Route
        path="/interviews/:interviewId/configuration"
        element={
          <RecruiterRoute>
            <InterviewConfiguration />
          </RecruiterRoute>
        }
      />

      <Route
        path="/interviews/:interviewId/monitoring"
        element={
          <RecruiterRoute>
            <MonitoringSetup />
          </RecruiterRoute>
        }
      />

      {/* ======================================================
          CANDIDATE - INTERVIEW LOBBY
      ====================================================== */}

      <Route
        path="/interviews/:interviewId"
        element={
          <ProtectedRoute>
            <InterviewLobby />
          </ProtectedRoute>
        }
      />

      {/* ======================================================
          CANDIDATE - INTERVIEW SESSION
      ====================================================== */}

      <Route
        path="/interviews/:interviewId/sessions/:sessionId"
        element={
          <ProtectedRoute>
            <InterviewSession />
          </ProtectedRoute>
        }
      />

      {/* ======================================================
          INTERVIEW ENDED
      ====================================================== */}

      <Route
        path="/interview-ended"
        element={
          <ProtectedRoute>
            <InterviewEnded />
          </ProtectedRoute>
        }
      />

      {/* ======================================================
          CANDIDATE - INTERVIEW REPORT
      ====================================================== */}

      <Route
        path="/interviews/:interviewId/sessions/:sessionId/report"
        element={
          <RecruiterRoute>
            <ReportRedirect />
          </RecruiterRoute>
        }
      />

      {/* ======================================================
          UNKNOWN ROUTE
      ====================================================== */}

      <Route
        path="*"
        element={
          <Navigate
            to="/"
            replace
          />
        }
      />

    </Routes>
    </Suspense>
  );
}

// ============================================================
// APP
// ============================================================

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;