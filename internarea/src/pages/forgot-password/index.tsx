import React, { useState } from "react";
import Link from "next/link";
import axios from "axios";
import { toast } from "react-toastify";
import { Mail, Phone, Loader2, KeyRound, CheckCircle2, Lock, Info } from "lucide-react";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

const RESET_BASE = "http://localhost:5000/api/auth/forgot-password";

// Must match MIN_PASSWORD_LENGTH / MAX_PASSWORD_LENGTH in
// backend/Routes/passwordReset.js (the backend enforces them too).
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type Stage = "email" | "code" | "newPassword" | "done" | "googleOnly";

const ForgotPassword = () => {
  const { t } = useTranslation("common");
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Single-use token the backend hands back once the emailed code is
  // verified. Kept in memory only (never in localStorage/sessionStorage).
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const startOver = (message = "") => {
    setStage("email");
    setCode("");
    setResetToken("");
    setNewPassword("");
    setConfirmPassword("");
    setErrorMessage(message);
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage(t("forgotPassword.errors.emailRequired"));
      return;
    }

    try {
      setIsRequesting(true);
      const res = await axios.post(`${RESET_BASE}/request`, {
        email: trimmedEmail,
      });
      setInfoMessage(res.data.message);
      toast.success(res.data.message);
      setStage("code");
    } catch (error: any) {
      const backendMessage = error?.response?.data?.error;
      if (backendMessage) {
        toast.error(backendMessage);
        setErrorMessage(backendMessage);
      } else {
        toast.error(t("common.error"));
        setErrorMessage(t("common.error"));
      }
    } finally {
      setIsRequesting(false);
    }
  };

  const handleConfirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setErrorMessage(t("forgotPassword.errors.codeRequired"));
      return;
    }

    try {
      setIsConfirming(true);
      const res = await axios.post(`${RESET_BASE}/confirm`, {
        email: email.trim(),
        code: trimmedCode,
      });

      // The code is spent now; it must not stay in the UI.
      setCode("");

      if (res.data?.passwordResetSupported === false) {
        // Verified, but this account signs in with Google only, so there is
        // no password to reset. Say so instead of pretending.
        setStage("googleOnly");
        return;
      }

      if (res.data?.resetToken) {
        setResetToken(res.data.resetToken);
        toast.success(t("forgotPassword.toasts.codeVerified"));
        setStage("newPassword");
        return;
      }

      setErrorMessage(t("common.error"));
    } catch (error: any) {
      const backendData = error?.response?.data;
      let message: string;

      if (backendData?.code === "PASSWORD_RESET_UNAVAILABLE") {
        message = t("forgotPassword.errors.unavailable");
      } else if (backendData?.code === "ACCOUNT_NOT_FOUND") {
        message = t("forgotPassword.errors.accountNotFound");
      } else {
        message = backendData?.error || t("common.error");
      }

      toast.error(message);
      setErrorMessage(message);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!newPassword) {
      setErrorMessage(t("forgotPassword.errors.passwordRequired"));
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(t("forgotPassword.errors.passwordTooShort"));
      return;
    }
    if (newPassword.length > MAX_PASSWORD_LENGTH) {
      setErrorMessage(t("forgotPassword.errors.passwordTooLong"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage(t("auth.errors.passwordMismatch"));
      return;
    }

    try {
      setIsResetting(true);
      await axios.post(`${RESET_BASE}/reset`, {
        email: email.trim(),
        resetToken,
        newPassword,
      });

      // Drop every secret from memory before showing the success screen.
      setNewPassword("");
      setConfirmPassword("");
      setResetToken("");
      setCode("");
      toast.success(t("forgotPassword.toasts.passwordReset"));
      setStage("done");
    } catch (error: any) {
      const backendData = error?.response?.data;

      switch (backendData?.code) {
        case "INVALID_OR_EXPIRED_TOKEN":
          // The verified session expired or was already used.
          startOver(t("forgotPassword.errors.sessionExpired"));
          toast.error(t("forgotPassword.errors.sessionExpired"));
          return;
        case "DAILY_LIMIT":
          startOver(t("forgotPassword.onceADayNotice"));
          toast.error(t("forgotPassword.onceADayNotice"));
          return;
        case "GOOGLE_ONLY":
          setNewPassword("");
          setConfirmPassword("");
          setResetToken("");
          setStage("googleOnly");
          return;
        default: {
          let message: string;
          if (backendData?.code === "WEAK_PASSWORD") {
            message = t("forgotPassword.errors.weakPassword");
          } else if (backendData?.code === "PASSWORD_TOO_SHORT") {
            message = t("forgotPassword.errors.passwordTooShort");
          } else if (backendData?.code === "PASSWORD_TOO_LONG") {
            message = t("forgotPassword.errors.passwordTooLong");
          } else if (backendData?.code === "PASSWORD_RESET_UNAVAILABLE") {
            message = t("forgotPassword.errors.unavailable");
          } else if (backendData?.code === "ACCOUNT_NOT_FOUND") {
            message = t("forgotPassword.errors.accountNotFound");
          } else {
            message = t("common.error");
          }
          toast.error(message);
          setErrorMessage(message);
        }
      }
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{t("forgotPassword.title")}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {t("forgotPassword.subtitle")}
            </p>
          </div>

          {/* Method toggle: Email active, Phone honestly disabled */}
          <div className="flex mb-6 border border-gray-200 rounded-md overflow-hidden">
            <button
              type="button"
              className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium bg-blue-600 text-white"
            >
              <Mail className="h-4 w-4" />
              {t("forgotPassword.emailTab")}
            </button>
            <button
              type="button"
              disabled
              title={t("forgotPassword.phoneComingSoonTitle")}
              className="flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium bg-gray-50 text-gray-400 cursor-not-allowed"
            >
              <Phone className="h-4 w-4" />
              {t("forgotPassword.phoneTab")}
            </button>
          </div>

          {stage === "email" && (
            <form onSubmit={handleRequestCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("forgotPassword.registeredEmailLabel")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("forgotPassword.emailPlaceholder")}
                  className="text-black mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                />
              </div>

              {errorMessage && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isRequesting}
                className="w-full inline-flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRequesting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    {t("forgotPassword.sendingCode")}
                  </>
                ) : (
                  t("forgotPassword.sendCode")
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                {t("forgotPassword.onceADayNotice")}
              </p>
            </form>
          )}

          {stage === "code" && (
            <form onSubmit={handleConfirmCode} className="space-y-4">
              {infoMessage && (
                <div className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
                  {infoMessage}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("forgotPassword.verificationCodeLabel")}
                </label>
                <div className="flex items-center border border-gray-300 rounded-md px-3">
                  <KeyRound className="h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t("forgotPassword.codePlaceholder")}
                    maxLength={6}
                    className="text-black ml-2 py-2 w-full focus:outline-none text-sm tracking-widest"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t("forgotPassword.codeExpiryNotice")}
                </p>
              </div>

              {errorMessage && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isConfirming}
                className="w-full inline-flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    {t("forgotPassword.verifying")}
                  </>
                ) : (
                  t("forgotPassword.verifyCode")
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStage("email");
                  setCode("");
                  setErrorMessage("");
                }}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                {t("forgotPassword.useDifferentEmail")}
              </button>
            </form>
          )}

          {stage === "newPassword" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                {t("forgotPassword.codeVerifiedDescription", { email: email.trim() })}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("forgotPassword.newPasswordLabel")}
                </label>
                <div className="flex items-center border border-gray-300 rounded-md px-3">
                  <Lock className="h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t("forgotPassword.newPasswordPlaceholder")}
                    autoComplete="new-password"
                    maxLength={MAX_PASSWORD_LENGTH + 1}
                    className="text-black ml-2 py-2 w-full focus:outline-none text-sm"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {t("forgotPassword.passwordRequirements")}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("forgotPassword.confirmNewPasswordLabel")}
                </label>
                <div className="flex items-center border border-gray-300 rounded-md px-3">
                  <Lock className="h-4 w-4 text-gray-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t("forgotPassword.confirmNewPasswordPlaceholder")}
                    autoComplete="new-password"
                    maxLength={MAX_PASSWORD_LENGTH + 1}
                    className="text-black ml-2 py-2 w-full focus:outline-none text-sm"
                  />
                </div>
              </div>

              {errorMessage && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {errorMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={isResetting}
                className="w-full inline-flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    {t("forgotPassword.resettingPassword")}
                  </>
                ) : (
                  t("forgotPassword.resetPasswordButton")
                )}
              </button>

              <button
                type="button"
                onClick={() => startOver()}
                className="w-full text-sm text-gray-500 hover:text-gray-700 py-1"
              >
                {t("forgotPassword.useDifferentEmail")}
              </button>
            </form>
          )}

          {stage === "googleOnly" && (
            <div className="text-center space-y-4">
              <Info className="h-10 w-10 text-blue-600 mx-auto" />
              <h2 className="text-lg font-semibold text-gray-900">
                {t("forgotPassword.googleOnlyTitle")}
              </h2>
              <p className="text-sm text-gray-700">
                {t("forgotPassword.googleOnlyMessage", { email: email.trim() })}
              </p>
              <Link
                href="/"
                className="inline-block text-sm text-blue-600 hover:text-blue-700"
              >
                {t("forgotPassword.returnHome")}
              </Link>
            </div>
          )}

          {stage === "done" && (
            <div className="text-center space-y-4">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
              <h2 className="text-lg font-semibold text-gray-900">
                {t("forgotPassword.successTitle")}
              </h2>
              <p className="text-sm text-gray-800">{t("forgotPassword.successMessage")}</p>
              <Link
                href="/"
                className="inline-block text-sm text-blue-600 hover:text-blue-700"
              >
                {t("forgotPassword.returnHome")}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
