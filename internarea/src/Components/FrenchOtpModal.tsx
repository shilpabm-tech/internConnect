import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import { X, Loader2 } from "lucide-react";
import { useTranslation } from "next-i18next/pages";

const OTP_BASE = "http://localhost:5000/api/auth/language-otp";

interface FrenchOtpModalProps {
  isOpen: boolean;
  firebaseUid: string;
  email: string;
  onClose: () => void;
  onVerified: () => void;
}

const FrenchOtpModal: React.FC<FrenchOtpModalProps> = ({
  isOpen,
  firebaseUid,
  email,
  onClose,
  onVerified,
}) => {
  const { t } = useTranslation("common");
  const [otp, setOtp] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const hasRequestedRef = useRef(false);

  const errorFromCode = useCallback(
    (code?: string) => {
      switch (code) {
        case "INVALID_OTP":
          return t("frenchOtp.errors.invalidOtp");
        case "OTP_EXPIRED":
          return t("frenchOtp.errors.otpExpired");
        case "TOO_MANY_ATTEMPTS":
          return t("frenchOtp.errors.tooManyAttempts");
        case "RATE_LIMITED":
          return t("frenchOtp.errors.rateLimited");
        case "SEND_FAILED":
          return t("frenchOtp.errors.sendFailed");
        case "NO_EMAIL":
          return t("frenchOtp.errors.noEmail");
        default:
          return t("common.error");
      }
    },
    [t]
  );

  const requestOtp = useCallback(async () => {
    setErrorMessage("");
    setInfoMessage("");
    try {
      setIsSending(true);
      const res = await axios.post(`${OTP_BASE}/request`, {
        firebaseUid,
        language: "fr",
      });
      if (res.data?.code === "ALREADY_VERIFIED") {
        onVerified();
        return;
      }
      setOtpSent(true);
      setCooldown(res.data?.cooldownSeconds ?? 60);
      setInfoMessage(t("frenchOtp.otpSent"));
    } catch (error: any) {
      const data = error?.response?.data;
      if (data?.code === "COOLDOWN") {
        // An OTP was sent very recently; let the user enter it.
        setOtpSent(true);
        setCooldown(data.retryAfterSeconds ?? 60);
        setInfoMessage(t("frenchOtp.otpSent"));
      } else {
        if (data?.code === "RATE_LIMITED" && data.retryAfterSeconds) {
          setCooldown(data.retryAfterSeconds);
        }
        setErrorMessage(errorFromCode(data?.code || "SEND_FAILED"));
      }
    } finally {
      setIsSending(false);
    }
  }, [firebaseUid, onVerified, t, errorFromCode]);

  // Send the first OTP automatically each time the modal opens.
  useEffect(() => {
    if (isOpen && !hasRequestedRef.current) {
      hasRequestedRef.current = true;
      requestOtp();
    }
    if (!isOpen) {
      hasRequestedRef.current = false;
      setOtp("");
      setOtpSent(false);
      setCooldown(0);
      setErrorMessage("");
      setInfoMessage("");
    }
  }, [isOpen, requestOtp]);

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");
    setInfoMessage("");

    if (!otp.trim()) {
      setErrorMessage(t("frenchOtp.errors.enterOtp"));
      return;
    }

    try {
      setIsVerifying(true);
      await axios.post(`${OTP_BASE}/verify`, {
        firebaseUid,
        language: "fr",
        code: otp.trim(),
      });
      onVerified();
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 px-4">
      <div className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("auth.close")}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-gray-900 mb-1">{t("frenchOtp.title")}</h2>
        <p className="text-sm font-medium text-blue-700 mb-1">
          {t("frenchOtp.verificationRequired")}
        </p>
        <p className="text-sm text-gray-600 mb-4">
          {t("frenchOtp.description", { email })}
        </p>

        <form onSubmit={handleVerify} className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            {t("frenchOtp.otpLabel")}
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder={t("frenchOtp.otpPlaceholder")}
            className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm tracking-widest focus:border-blue-500 focus:ring-blue-500"
          />

          {infoMessage && !errorMessage && (
            <p className="text-sm text-green-700">{infoMessage}</p>
          )}
          {errorMessage && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isVerifying || isSending || !otpSent}
            className="w-full bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isVerifying ? (
              <>
                <Loader2 className="animate-spin h-4 w-4" />
                {t("frenchOtp.verifying")}
              </>
            ) : (
              t("frenchOtp.verifyButton")
            )}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={requestOtp}
            disabled={isSending || cooldown > 0}
            className="text-blue-600 hover:text-blue-700 disabled:text-gray-400"
          >
            {isSending ? t("frenchOtp.sending") : t("frenchOtp.resendButton")}
          </button>
          {cooldown > 0 && (
            <span className="text-gray-500">
              {t("frenchOtp.resendIn", { seconds: cooldown })}
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

export default FrenchOtpModal;
