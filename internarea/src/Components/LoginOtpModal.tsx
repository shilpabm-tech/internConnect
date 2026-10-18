import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next/pages";

const LOGIN_SECURITY_BASE = `${process.env.NEXT_PUBLIC_API_URL}/api/auth/login-security`;

interface LoginOtpModalProps {
  isOpen: boolean;
  firebaseUid: string;
  email: string;
  loginHistoryId: string;
  // Seconds before "Resend" unlocks, as reported by the backend (it may be
  // less than 60 if the OTP was already sent a while ago).
  initialCooldownSeconds?: number;
  onClose: () => void;
  onVerified: (user: any) => void;
}

const LoginOtpModal: React.FC<LoginOtpModalProps> = ({
  isOpen,
  firebaseUid,
  email,
  loginHistoryId,
  initialCooldownSeconds = 60,
  onClose,
  onVerified,
}) => {
  const { t } = useTranslation("common");
  const [otp, setOtp] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(60);
  const [errorMessage, setErrorMessage] = useState("");
  const hasInitRef = useRef(false);
  // Synchronous guard: two quick clicks can both fire before the disabled
  // state from setIsResending has re-rendered.
  const resendInFlightRef = useRef(false);

  const errorFromCode = useCallback(
    (code?: string) => {
      switch (code) {
        case "INVALID_OTP":
          return t("loginOtp.errors.invalidOtp");
        case "OTP_EXPIRED":
          return t("loginOtp.errors.otpExpired");
        case "TOO_MANY_ATTEMPTS":
          return t("loginOtp.errors.tooManyAttempts");
        case "RATE_LIMITED":
        case "COOLDOWN":
          return t("loginOtp.errors.rateLimited");
        case "EMAIL_RATE_LIMITED":
          return t("loginSecurity.emailRateLimited");
        case "EMAIL_UNAVAILABLE":
        case "SEND_FAILED":
          return t("loginOtp.errors.sendFailed");
        default:
          return t("common.error");
      }
    },
    [t]
  );

  useEffect(() => {
    if (isOpen && !hasInitRef.current) {
      hasInitRef.current = true;
      setCooldown(initialCooldownSeconds);
    }
    if (!isOpen) {
      hasInitRef.current = false;
      setOtp("");
      setErrorMessage("");
      setCooldown(60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    setErrorMessage("");
    try {
      setIsResending(true);
      const res = await axios.post(`${LOGIN_SECURITY_BASE}/resend-otp`, {
        firebaseUid,
        loginHistoryId,
      });
      setCooldown(res.data?.cooldownSeconds ?? 60);
    } catch (error: any) {
      const data = error?.response?.data;
      if (
        (data?.code === "COOLDOWN" || data?.code === "EMAIL_RATE_LIMITED") &&
        data.retryAfterSeconds
      ) {
        setCooldown(data.retryAfterSeconds);
      }
      setErrorMessage(errorFromCode(data?.code));
    } finally {
      setIsResending(false);
      resendInFlightRef.current = false;
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!otp.trim()) {
      setErrorMessage(t("loginOtp.errors.enterOtp"));
      return;
    }

    try {
      setIsVerifying(true);
      const res = await axios.post(`${LOGIN_SECURITY_BASE}/verify-otp`, {
        firebaseUid,
        loginHistoryId,
        code: otp.trim(),
      });
      onVerified(res.data.user);
    } catch (error: any) {
      const code = error?.response?.data?.code;
      setErrorMessage(errorFromCode(code));
      if (code === "OTP_EXPIRED" || code === "TOO_MANY_ATTEMPTS") {
        setOtp("");
      }
    } finally {
      setIsVerifying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 px-4">
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("auth.close")}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-1">{t("loginOtp.title")}</h2>
        <p className="text-sm font-medium text-blue-700 mb-1">
          {t("loginOtp.chromeNotice")}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          {t("loginOtp.description", { email })}
        </p>

        <form onSubmit={handleVerify} className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            {t("loginOtp.otpLabel")}
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder={t("loginOtp.otpPlaceholder")}
            className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm tracking-widest focus:border-blue-500 focus:ring-blue-500"
            autoFocus
          />

          {errorMessage && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isVerifying}
            className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                {t("loginOtp.verifying")}
              </>
            ) : (
              t("loginOtp.verifyButton")
            )}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending || cooldown > 0}
            className="text-blue-600 hover:text-blue-700 disabled:text-gray-400"
          >
            {isResending ? t("loginOtp.sending") : t("loginOtp.resendButton")}
          </button>
          {cooldown > 0 && (
            <span className="text-gray-500">
              {t("loginOtp.resendIn", { seconds: cooldown })}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700"
        >
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
};

export default LoginOtpModal;
