import Footer from "@/Components/Fotter";
import Navbar from "@/Components/Navbar";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { store } from "@/store/store";
import { Provider, useDispatch } from "react-redux";
import { useState, useEffect, useRef } from "react";
import { auth } from "@/firebase/firebase";
import { signOut } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";
import { login, logout, setMongoUser } from "@/Feature/Userslice";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import axios from "axios";
import { appWithTranslation, useTranslation } from "next-i18next/pages";
import LoginOtpModal from "@/Components/LoginOtpModal";

const LOGIN_SECURITY_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login-security`;

// What the backend decided for a sign-in. Computed once per signed-in user by
// runSecurityCheck() and then only *applied* by the listener below.
type GateResult =
  | { kind: "allowed"; user?: any }
  | { kind: "otp"; loginHistoryId: string; cooldownSeconds: number }
  | { kind: "blocked" }
  | { kind: "emailRateLimited"; retryAfterSeconds: number }
  | { kind: "emailUnavailable" }
  | { kind: "cooldown"; retryAfterSeconds: number }
  | { kind: "rejected" };

interface Gate {
  uid: string;
  promise: Promise<GateResult>;
  verifiedUser?: any;
}

// ONE security check per signed-in user for the lifetime of the page.
//
// This is deliberately module-level state. Previously the listener lived
// inside <App> and was re-created on every App render (each route change /
// language change), so every re-render re-subscribed to onAuthStateChanged,
// Firebase immediately re-fired it for the current user, and each re-fire
// called /check again - which for Chrome sent another OTP email.
let gate: Gate | null = null;

// Per-tab hint that lets the backend recognise a reload of a session this
// browser already started/verified, instead of treating it as a new login.
// It holds only a history-record id - never an OTP or any secret.
const resumeKey = (uid: string) => `loginSecurity:${uid}`;
const readResumeId = (uid: string): string | null => {
  try {
    return window.sessionStorage.getItem(resumeKey(uid));
  } catch (e) {
    return null;
  }
};
const writeResumeId = (uid: string, id: string) => {
  try {
    window.sessionStorage.setItem(resumeKey(uid), id);
  } catch (e) {}
};
const clearResumeId = (uid: string) => {
  try {
    window.sessionStorage.removeItem(resumeKey(uid));
  } catch (e) {}
};

async function runSecurityCheck(authuser: FirebaseUser): Promise<GateResult> {
  const resumeId = readResumeId(authuser.uid);
  try {
    // The backend independently parses the User-Agent, checks the
    // Asia/Kolkata mobile-login window and decides whether Chrome needs an
    // OTP. The frontend only acts on what it returns - it never decides
    // Chrome/mobile/allowed itself.
    const res = await axios.post(`${LOGIN_SECURITY_BASE}/check`, {
      firebaseUid: authuser.uid,
      name: authuser.displayName,
      email: authuser.email,
      photo: authuser.photoURL,
      ...(resumeId ? { resumeLoginHistoryId: resumeId } : {}),
    });

    if (res.data?.loginHistoryId) {
      writeResumeId(authuser.uid, String(res.data.loginHistoryId));
    }

    if (res.data?.status === "otp_required") {
      return {
        kind: "otp",
        loginHistoryId: String(res.data.loginHistoryId),
        cooldownSeconds: res.data.cooldownSeconds ?? 60,
      };
    }
    return { kind: "allowed", user: res.data.user };
  } catch (error: any) {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const code = data?.code;

    // Deliberate, backend-issued outcomes: these must NEVER fall through to
    // a login. (A failed OTP email used to be handled like "backend is
    // down" and granted access without an OTP.)
    if (code === "MOBILE_WINDOW_BLOCKED") return { kind: "blocked" };
    if (code === "EMAIL_RATE_LIMITED") {
      return { kind: "emailRateLimited", retryAfterSeconds: data?.retryAfterSeconds ?? 5 };
    }
    if (code === "EMAIL_UNAVAILABLE") return { kind: "emailUnavailable" };
    if (code === "COOLDOWN") {
      return { kind: "cooldown", retryAfterSeconds: data?.retryAfterSeconds ?? 60 };
    }

    // Only a genuine infrastructure failure (no HTTP response at all, an
    // unhandled 5xx without one of our error codes, or SERVER_ERROR) falls
    // back to the pre-Task-6 sync-only login so Tasks 1-5 keep working
    // while the backend/Mongo is down. That attempt is simply not recorded.
    const infrastructureFailure =
      !error?.response || code === "SERVER_ERROR" || (!code && status >= 500);
    if (!infrastructureFailure) return { kind: "rejected" };

    console.error("Login security check unavailable, falling back:", error?.message);
    try {
      const fallback = await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/api/user/sync`, {
        firebaseUid: authuser.uid,
        name: authuser.displayName,
        email: authuser.email,
        photo: authuser.photoURL,
      });
      return { kind: "allowed", user: fallback.data };
    } catch (syncError) {
      console.error("User sync failed:", syncError);
      return { kind: "allowed" };
    }
  }
}

interface PendingOtp {
  firebaseUid: string;
  email: string;
  loginHistoryId: string;
  cooldownSeconds: number;
}

// Declared at module level (not inside App) so its identity is stable and
// React never unmounts/remounts it - and so the effect below runs once.
function AuthListener() {
  const dispatch = useDispatch();
  const { t } = useTranslation("common");

  // `t` changes identity when the language/namespaces load. Reading it from
  // a ref keeps it out of the effect's dependencies so a language change
  // can never re-subscribe the Firebase listener.
  const tRef = useRef(t);
  tRef.current = t;

  // Pending Chrome-login OTP challenge, if any. While this is set the
  // Firebase session exists, but Redux is NOT marked as logged in, so the
  // rest of the app keeps rendering as logged-out until the backend
  // confirms the OTP.
  const [pendingOtp, setPendingOtp] = useState<PendingOtp | null>(null);

  useEffect(() => {
    let active = true;

    const reject = async (message: string) => {
      toast.error(message, { toastId: "login-security" });
      setPendingOtp(null);
      await signOut(auth);
    };

    const unsubscribe = auth.onAuthStateChanged(async (authuser) => {
      if (!authuser) {
        if (gate) clearResumeId(gate.uid);
        gate = null;
        dispatch(logout());
        setPendingOtp(null);
        return;
      }

      console.log("Firebase UID:", authuser.uid);

      // Re-fires of onAuthStateChanged for the same user (re-subscribe,
      // React StrictMode, hot reload) share the existing check instead of
      // starting another one.
      if (!gate || gate.uid !== authuser.uid) {
        gate = { uid: authuser.uid, promise: runSecurityCheck(authuser) };
      }
      const current = gate;
      const result = await current.promise;
      if (!active || gate !== current) return;

      const loginPayload = {
        uid: authuser.uid,
        photo: authuser.photoURL,
        name: authuser.displayName,
        email: authuser.email,
        phoneNumber: authuser.phoneNumber,
      };

      switch (result.kind) {
        case "allowed":
          dispatch(login(loginPayload));
          if (result.user) dispatch(setMongoUser(result.user));
          setPendingOtp(null);
          break;

        case "otp":
          if (current.verifiedUser) {
            dispatch(login(loginPayload));
            dispatch(setMongoUser(current.verifiedUser));
            setPendingOtp(null);
          } else {
            setPendingOtp({
              firebaseUid: authuser.uid,
              email: authuser.email || "",
              loginHistoryId: result.loginHistoryId,
              cooldownSeconds: result.cooldownSeconds,
            });
          }
          break;

        case "blocked":
          await reject(tRef.current("loginSecurity.mobileWindowBlocked"));
          break;

        case "emailRateLimited":
          await reject(tRef.current("loginSecurity.emailRateLimited"));
          break;

        case "emailUnavailable":
          await reject(tRef.current("loginSecurity.emailUnavailable"));
          break;

        case "cooldown":
          await reject(tRef.current("loginOtp.errors.rateLimited"));
          break;

        default:
          await reject(tRef.current("common.error"));
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [dispatch]);

  const handleOtpVerified = (mongoUser: any) => {
    if (!pendingOtp) return;
    if (gate && gate.uid === pendingOtp.firebaseUid) {
      gate.verifiedUser = mongoUser;
    }
    const current = auth.currentUser;
    dispatch(
      login({
        uid: pendingOtp.firebaseUid,
        photo: current?.photoURL,
        name: current?.displayName,
        email: current?.email,
        phoneNumber: current?.phoneNumber,
      })
    );
    dispatch(setMongoUser(mongoUser));
    setPendingOtp(null);
    toast.success(tRef.current("loginOtp.verifiedSuccess"));
  };

  const handleOtpModalClose = async () => {
    // Without a successful OTP, access must not be granted. Sign the
    // Firebase session out as well so the app is left in a clean
    // logged-out state rather than an unverified dangling session.
    setPendingOtp(null);
    await signOut(auth);
  };

  return (
    <LoginOtpModal
      isOpen={Boolean(pendingOtp)}
      firebaseUid={pendingOtp?.firebaseUid || ""}
      email={pendingOtp?.email || ""}
      loginHistoryId={pendingOtp?.loginHistoryId || ""}
      initialCooldownSeconds={pendingOtp?.cooldownSeconds ?? 60}
      onClose={handleOtpModalClose}
      onVerified={handleOtpVerified}
    />
  );
}

function App({ Component, pageProps }: AppProps) {
  return (
    <Provider store={store}>
      <AuthListener />
      <div className="bg-white">
        <ToastContainer />
        <Navbar />
        <Component {...pageProps} />
        <Footer />
      </div>
    </Provider>
  );
}

export default appWithTranslation(App);
