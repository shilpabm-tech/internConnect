import React, { useState } from "react";
import { useRouter } from "next/router";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  updatePassword,
} from "firebase/auth";
import { auth } from "@/firebase/firebase";
import { toast } from "react-toastify";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next/pages";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGoogleLogin: () => Promise<void>;
}

type Mode = "login" | "register";
type UserType = "student" | "employer";

function mapFirebaseError(code: string, t: (key: string) => string): string {
  switch (code) {
    case "auth/user-not-found":
      return t("auth.errors.userNotFound");
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return t("auth.errors.wrongPassword");
    case "auth/email-already-in-use":
      return t("auth.errors.emailInUse");
    case "auth/weak-password":
      return t("auth.errors.weakPassword");
    case "auth/invalid-email":
      return t("auth.errors.invalidEmail");
    case "auth/operation-not-allowed":
      return t("auth.errors.operationNotAllowed");
    case "auth/popup-closed-by-user":
      return t("auth.errors.popupClosed");
    case "auth/cancelled-popup-request":
      return t("auth.errors.popupClosed");
    case "auth/popup-blocked":
      return t("auth.errors.popupBlocked");
    case "auth/account-exists-with-different-credential":
      return t("auth.errors.accountExistsDifferentCredential");
    case "auth/requires-recent-login":
      return t("auth.errors.requiresRecentLogin");
    default:
      return t("common.error");
  }
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onGoogleLogin }) => {
  const router = useRouter();
  const { t } = useTranslation("common");

  const [mode, setMode] = useState<Mode>("login");
  const [userType, setUserType] = useState<UserType>("student");

  const [showEmailFields, setShowEmailFields] = useState(false);
  const [showPasswordSetup, setShowPasswordSetup] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const resetFields = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setError("");
    setShowEmailFields(false);
    setShowPasswordSetup(false);
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    resetFields();
  };

  const handleClose = () => {
    resetFields();
    setMode("login");
    onClose();
  };

  const handleGoogleClick = async () => {
    setError("");
    try {
      setIsGoogleSubmitting(true);
      await onGoogleLogin();

      const firebaseUser = auth.currentUser;
      const hasPasswordProvider = firebaseUser?.providerData?.some(
        (p) => p.providerId === "password"
      );

      if (hasPasswordProvider) {
        toast.success(t("auth.toasts.loginSuccess"));
        handleClose();
      } else {
        toast.success(t("auth.toasts.googleLoginSuccess"));
        setShowPasswordSetup(true);
      }
    } catch (err: any) {
      const message = mapFirebaseError(err?.code, t);
      setError(message);
      toast.error(message);
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleForgotPasswordClick = () => {
    handleClose();
    router.push("/forgot-password");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) {
      setError(t("auth.errors.emailRequired"));
      return;
    }
    if (!password) {
      setError(t("auth.errors.passwordRequired"));
      return;
    }

    if (mode === "register") {
      if (!name.trim()) {
        setError(t("auth.errors.nameRequired"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("auth.errors.passwordMismatch"));
        return;
      }
    }

    try {
      setIsSubmitting(true);
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), password);
        toast.success(t("auth.toasts.loginSuccess"));
      } else {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        if (name.trim()) {
          await updateProfile(cred.user, { displayName: name.trim() });
        }
        toast.success(t("auth.toasts.accountCreated"));
      }
      handleClose();
    } catch (err: any) {
      const message = mapFirebaseError(err?.code, t);
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError(t("auth.errors.weakPassword"));
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError(t("auth.errors.passwordMismatch"));
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError(t("auth.errors.noActiveSession"));
      return;
    }

    try {
      setIsSettingPassword(true);
      await updatePassword(currentUser, newPassword);
      toast.success(t("auth.toasts.passwordSetSuccess"));
      handleClose();
    } catch (err: any) {
      const message = mapFirebaseError(err?.code, t);
      setError(message);
      toast.error(message);
    } finally {
      setIsSettingPassword(false);
    }
  };

  const showInlineLoginFields = mode === "login";
  const showRegisterMethodChoice = mode === "register" && !showEmailFields;
  const showRegisterEmailFields = mode === "register" && showEmailFields;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 relative">
        <button
          onClick={handleClose}
          aria-label={t("auth.close")}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {showPasswordSetup ? (
          <>
            <h2 className="text-xl font-bold text-gray-900 mb-1">{t("auth.setPasswordTitle")}</h2>
            <p className="text-sm text-gray-500 mb-5">
              {t("auth.setPasswordSubtitle")}
            </p>

            <form onSubmit={handleSetPassword} className="space-y-3">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("auth.passwordPlaceholder")}
                className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder={t("auth.confirmPasswordPlaceholder")}
                className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
              />

              <div className="text-right">
                <button
                  type="button"
                  onClick={handleForgotPasswordClick}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {t("auth.forgotPassword")}
                </button>
              </div>

              {error && <ErrorBox message={error} />}

              <button
                type="submit"
                disabled={isSettingPassword}
                className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
              >
                {isSettingPassword ? (
                  <Loader2 className="animate-spin h-4 w-4" />
                ) : (
                  t("auth.setPasswordButton")
                )}
              </button>
            </form>
          </>
        ) : (
          <>
            {/* Student / Employer tabs */}
            <div className="flex border border-gray-200 rounded-md overflow-hidden mb-5">
              <button
                type="button"
                onClick={() => setUserType("student")}
                className={`flex-1 py-2 text-sm font-medium ${
                  userType === "student"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t("auth.student")}
              </button>
              <button
                type="button"
                onClick={() => setUserType("employer")}
                className={`flex-1 py-2 text-sm font-medium ${
                  userType === "employer"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                }`}
              >
                {t("auth.employer")}
              </button>
            </div>

            <h2 className="text-xl font-bold text-gray-900 mb-1">
              {mode === "login" ? t("auth.login") : t("auth.register")}
            </h2>
            <p className="text-sm text-gray-500 mb-5">
              {mode === "login"
                ? t("auth.welcomeBackSubtitle")
                : t("auth.createAccountSubtitle")}
            </p>

            {showInlineLoginFields && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={isGoogleSubmitting}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 flex items-center justify-center space-x-2 hover:bg-gray-50 disabled:opacity-50 mb-4"
                >
                  {isGoogleSubmitting ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5 text-gray-500" />
                      <span className="text-gray-700 text-sm">
                        {t("auth.connectingGoogle")}
                      </span>
                    </>
                  ) : (
                    <>
                      <GoogleIcon />
                      <span className="text-gray-700 text-sm">{t("auth.loginWithGoogle")}</span>
                    </>
                  )}
                </button>

                <Divider />

                <form onSubmit={handleSubmit} className="space-y-3">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("auth.passwordPlaceholder")}
                    className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  />

                  <div className="text-right">
                    <button
                      type="button"
                      onClick={handleForgotPasswordClick}
                      className="text-xs text-blue-600 hover:text-blue-700"
                    >
                      {t("auth.forgotPassword")}
                    </button>
                  </div>

                  {error && <ErrorBox message={error} />}

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                  >
                    {isSubmitting ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      t("auth.login")
                    )}
                  </button>
                </form>
              </>
            )}

            {showRegisterMethodChoice && (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleGoogleClick}
                  disabled={isGoogleSubmitting}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 flex items-center justify-center space-x-2 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isGoogleSubmitting ? (
                    <>
                      <Loader2 className="animate-spin h-5 w-5 text-gray-500" />
                      <span className="text-gray-700 text-sm">
                        {t("auth.connectingGoogle")}
                      </span>
                    </>
                  ) : (
                    <>
                      <GoogleIcon />
                      <span className="text-gray-700 text-sm">
                        {t("auth.continueWithGoogle")}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setShowEmailFields(true)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t("auth.continueWithEmail")}
                </button>

                {error && <ErrorBox message={error} />}

                <p className="text-xs text-gray-400 text-center pt-1">
                  {t("auth.termsNotice")}
                </p>
              </div>
            )}

            {showRegisterEmailFields && (
              <form onSubmit={handleSubmit} className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowEmailFields(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 mb-1"
                >
                  ← {t("common.back")}
                </button>

                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("auth.fullNamePlaceholder")}
                  className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("auth.emailPlaceholder")}
                  className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("auth.passwordPlaceholder")}
                  className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                />

                {error && <ErrorBox message={error} />}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    t("auth.createAccountButton")
                  )}
                </button>
              </form>
            )}

            <p className="text-center text-sm text-gray-500 mt-4">
              {mode === "login" ? (
                <>
                  {t("auth.newToPlatform")}{" "}
                  <button
                    onClick={() => switchMode("register")}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {t("auth.register")}
                  </button>
                </>
              ) : (
                <>
                  {t("auth.alreadyRegistered")}{" "}
                  <button
                    onClick={() => switchMode("login")}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {t("auth.login")}
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
};

const Divider = () => {
  const { t } = useTranslation("common");
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex-1 border-t border-gray-200" />
      <span className="text-xs text-gray-400">{t("auth.or")}</span>
      <div className="flex-1 border-t border-gray-200" />
    </div>
  );
};

const ErrorBox = ({ message }: { message: string }) => (
  <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
    {message}
  </div>
);

const GoogleIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default AuthModal;