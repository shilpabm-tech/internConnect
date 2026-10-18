import { selectuser } from "@/Feature/Userslice";
import { ExternalLink, Mail, MonitorSmartphone, User, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "next-i18next/pages";
import axios from "axios";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

const LOGIN_SECURITY_BASE = "http://localhost:5000/api/auth/login-security";
const HISTORY_PAGE_SIZE = 10;

interface LoginHistoryRecord {
  _id: string;
  browser: string;
  operatingSystem: string;
  deviceType: string;
  ipAddress: string;
  status: string;
  reason: string | null;
  timestamp: string;
}

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}
interface User {
  name: string;
  email: string;
  photo: string;
}
const index = () => {
  // const [user, setuser] = useState<User | null>({
  //   name: "Rahul",
  //   email: "xyz@gmail.com",
  //   photo:
  //     "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=64&h=64&fit=crop&crop=faces",
  // });
  const { t, i18n } = useTranslation("common");
  const user=useSelector(selectuser)
  const router = useRouter();

  const [historyRecords, setHistoryRecords] = useState<LoginHistoryRecord[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;

    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      setHistoryError(false);
      try {
        // The backend only ever returns the history belonging to the
        // firebaseUid in the URL (see Routes/loginSecurity.js) — this
        // user can never fetch another user's login history.
        const res = await axios.get(
          `${LOGIN_SECURITY_BASE}/history/${user.uid}?page=${historyPage}&limit=${HISTORY_PAGE_SIZE}`
        );
        if (cancelled) return;
        setHistoryRecords(res.data.records);
        setHistoryTotalPages(res.data.totalPages);
      } catch (error) {
        if (!cancelled) setHistoryError(true);
      } finally {
        if (!cancelled) setIsHistoryLoading(false);
      }
    };

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, historyPage]);

  const statusLabel = (status: string) => {
    switch (status) {
      case "success":
        return t("profile.loginHistory.status.success");
      case "failed":
        return t("profile.loginHistory.status.failed");
      case "blocked_mobile_time":
        return t("profile.loginHistory.status.blockedMobileTime");
      case "otp_required":
        return t("profile.loginHistory.status.otpRequired");
      case "otp_failed":
        return t("profile.loginHistory.status.otpFailed");
      case "otp_expired":
        return t("profile.loginHistory.status.otpExpired");
      default:
        return status;
    }
  };

  const statusBadgeClass = (status: string) => {
    if (status === "success") return "bg-green-100 text-green-700";
    if (status === "otp_required") return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden relative">
          <button
  onClick={() => router.push("/")}
  aria-label={t("profile.goHome")}
  className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow-md text-gray-600 hover:text-red-600 hover:bg-gray-100"
>
  <X size={20} />
</button>
          {/* Profile Header */}
          <div className="relative h-32 bg-gradient-to-r from-blue-500 to-blue-600">
            <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2">
              {user?.photo ? (
                <img
                  src={user?.photo}
                  alt={user?.name}
                  className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full border-4 border-white shadow-lg bg-gray-200 flex items-center justify-center">
                  <User className="h-12 w-12 text-gray-400" />
                </div>
              )}
            </div>
          </div>

          {/* Profile Content */}
          <div className="pt-16 pb-8 px-6">
            <div className="text-center mb-8">
              <h1 className="text-2xl font-bold text-gray-900">{user?.name}</h1>
              <div className="mt-2 flex items-center justify-center text-gray-500">
                <Mail className="h-4 w-4 mr-2" />
                <span>{user?.email}</span>
              </div>
            </div>

            {/* Profile Details */}
            <div className="space-y-6">
              {/* Quick Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <span className="text-blue-600 font-semibold text-2xl">
                    0
                  </span>
                  <p className="text-blue-600 text-sm mt-1">
                    {t("profile.activeApplications")}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <span className="text-green-600 font-semibold text-2xl">
                    0
                  </span>
                  <p className="text-green-600 text-sm mt-1">
                    {t("profile.acceptedApplications")}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-center pt-4">
                <Link
                  href="/userapplication"
                  className="inline-flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors duration-200"
                >
                  {t("profile.viewApplications")}
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Login History / Security */}
        {user?.uid && (
          <div className="bg-white rounded-2xl shadow-lg mt-6 p-6">
            <div className="flex items-center gap-2 mb-4">
              <MonitorSmartphone className="h-5 w-5 text-gray-700" />
              <h2 className="text-lg font-bold text-gray-900">
                {t("profile.loginHistory.title")}
              </h2>
            </div>

            {isHistoryLoading && (
              <p className="text-sm text-gray-500 py-4 text-center">{t("common.loading")}</p>
            )}

            {!isHistoryLoading && historyError && (
              <p className="text-sm text-red-600 py-4 text-center">
                {t("profile.loginHistory.loadError")}
              </p>
            )}

            {!isHistoryLoading && !historyError && historyRecords.length === 0 && (
              <p className="text-sm text-gray-500 py-4 text-center">
                {t("profile.loginHistory.empty")}
              </p>
            )}

            {!isHistoryLoading && !historyError && historyRecords.length > 0 && (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-medium text-gray-500 uppercase border-b border-gray-200">
                        <th className="py-2 pr-4">{t("profile.loginHistory.columns.dateTime")}</th>
                        <th className="py-2 pr-4">{t("profile.loginHistory.columns.browser")}</th>
                        <th className="py-2 pr-4">{t("profile.loginHistory.columns.os")}</th>
                        <th className="py-2 pr-4">{t("profile.loginHistory.columns.device")}</th>
                        <th className="py-2 pr-4">{t("profile.loginHistory.columns.ipAddress")}</th>
                        <th className="py-2 pr-4">{t("profile.loginHistory.columns.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRecords.map((record) => (
                        <tr key={record._id} className="border-b border-gray-100">
                          <td className="py-2 pr-4 text-gray-700 whitespace-nowrap">
                            {new Date(record.timestamp).toLocaleString(i18n.language)}
                          </td>
                          <td className="py-2 pr-4 text-gray-700">{record.browser}</td>
                          <td className="py-2 pr-4 text-gray-700">{record.operatingSystem}</td>
                          <td className="py-2 pr-4 text-gray-700">{record.deviceType}</td>
                          <td className="py-2 pr-4 text-gray-700">{record.ipAddress}</td>
                          <td className="py-2 pr-4">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(
                                record.status
                              )}`}
                            >
                              {statusLabel(record.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {historyTotalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm">
                    <button
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      disabled={historyPage <= 1}
                      className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                    >
                      {t("profile.loginHistory.previous")}
                    </button>
                    <span className="text-gray-500">
                      {t("profile.loginHistory.pageOf", {
                        page: historyPage,
                        total: historyTotalPages,
                      })}
                    </span>
                    <button
                      onClick={() => setHistoryPage((p) => Math.min(historyTotalPages, p + 1))}
                      disabled={historyPage >= historyTotalPages}
                      className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 disabled:opacity-40 hover:bg-gray-50"
                    >
                      {t("profile.loginHistory.next")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default index;
