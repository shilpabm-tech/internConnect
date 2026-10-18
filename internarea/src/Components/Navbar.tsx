import React, { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { useTranslation } from "next-i18next/pages";
import logo from "../Assets/logo.png";
import Link from "next/link";
import { auth, provider } from "../firebase/firebase";
import { ChevronDown, ChevronUp, Search, Users, Bell, Menu, X, Globe } from "lucide-react";
import { signInWithPopup, signOut } from "firebase/auth";
import { toast } from "react-toastify";
import { useSelector, useDispatch } from "react-redux";
import { selectuser } from "@/Feature/Userslice";
import { selectLanguage, setLanguage } from "@/Feature/Languageslice";
import axios from "axios";
import AuthModal from "./AuthModal";
import FrenchOtpModal from "./FrenchOtpModal";

const NOTIFICATION_BASE = "http://localhost:5000/api/notification";
const LANGUAGE_OTP_BASE = "http://localhost:5000/api/auth/language-otp";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "hi", label: "हिन्दी" },
  { code: "pt", label: "Português" },
  { code: "zh", label: "中文" },
  { code: "fr", label: "Français" },
];

interface User {
  name: string;
  email: string;
  photo: string;
}

interface NotificationUser {
  _id: string;
  name: string;
  email: string;
  photo: string;
  firebaseUid: string;
}

interface NotificationPost {
  _id: string;
  mediaUrl: string;
  mediaType: "photo" | "video";
  caption?: string;
}

interface AppNotification {
  _id: string;
  sender: NotificationUser;
  post?: NotificationPost;
  message: string;
  isRead: boolean;
  createdAt: string;
}

const Navbar = () => {
  const { t, i18n } = useTranslation("common");
  const user = useSelector(selectuser);
  const currentLanguage = useSelector(selectLanguage);
  const dispatch = useDispatch();
  const router = useRouter();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false);

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isLangDropdownOpen, setIsLangDropdownOpen] = useState(false);
  const [isFrenchOtpOpen, setIsFrenchOtpOpen] = useState(false);
  // Remembers which user we already confirmed as French-verified this session
  // (the source of truth is always the server; this only avoids extra calls).
  const frenchVerifiedUidRef = useRef<string | null>(null);

  const fetchUnreadCount = async () => {
    if (!user?.uid) return;
    try {
      const res = await axios.get(`${NOTIFICATION_BASE}/${user.uid}/unread-count`);
      setUnreadCount(res.data.count);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchUnreadCount();
  }, [user?.uid]);

  useEffect(() => {
    if (router.locale) {
      dispatch(setLanguage(router.locale));
    }
  }, [router.locale]);

  const handleToggleDropdown = async () => {
    const opening = !isDropdownOpen;
    setIsDropdownOpen(opening);
    if (opening) {
      setIsLangDropdownOpen(false);
    }
    
    if (opening && user?.uid) {
      try {
        setIsLoadingNotifications(true);
        const res = await axios.get(`${NOTIFICATION_BASE}/${user.uid}`);
        setNotifications(res.data);
      } catch (error) {
        console.log(error);
        toast.error(t("navbar.notificationsLoadError"));
      } finally {
        setIsLoadingNotifications(false);
      }
    }
  };

  const handleNotificationClick = async (notification: AppNotification) => {
    if (!user?.uid) return;
    try {
      if (!notification.isRead) {
        await axios.patch(`${NOTIFICATION_BASE}/${notification._id}/read`, {
          firebaseUid: user.uid,
        });
        setNotifications((prev) =>
          prev.map((n) => (n._id === notification._id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.log(error);
    }
    setIsDropdownOpen(false);
    if (notification.post?._id) {
      router.push(`/publicspace/${notification.post._id}`);
    }
  };

  const handlelogin = async () => {
    await signInWithPopup(auth, provider);
  };
  const handlelogout = () => {
    signOut(auth);
  };

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const applyLocale = (code: string) => {
    router.push({ pathname: router.pathname, query: router.query }, router.asPath, {
      locale: code,
    });
  };

  const handleLanguageSelect = async (code: string) => {
    setIsLangDropdownOpen(false);

    if (code !== "fr") {
      applyLocale(code);
      return;
    }

    if (!user?.uid) {
      toast.error(t("navbar.frenchLoginRequired"));
      return;
    }

    if (frenchVerifiedUidRef.current === user.uid) {
      applyLocale("fr");
      return;
    }

    try {
      const res = await axios.get(
        `${LANGUAGE_OTP_BASE}/status/${user.uid}?language=fr`
      );
      if (res.data?.verified) {
        frenchVerifiedUidRef.current = user.uid;
        applyLocale("fr");
        return;
      }
    } catch (error) {
      toast.error(t("frenchOtp.errors.statusCheckFailed"));
      return;
    }

    if (!user.email) {
      toast.error(t("frenchOtp.errors.noEmail"));
      return;
    }

    // Not verified yet: keep the current locale and ask for the email OTP.
    setIsFrenchOtpOpen(true);
  };

  const handleFrenchVerified = () => {
    setIsFrenchOtpOpen(false);
    if (user?.uid) {
      frenchVerifiedUidRef.current = user.uid;
    }
    toast.success(t("frenchOtp.verifiedSuccess"));
    applyLocale("fr");
  };

  // Guard: French may only be shown to a logged-in, OTP-verified user, even if
  // someone opens a /fr/... URL directly.
  useEffect(() => {
    if (router.locale !== "fr") return;
    if (user === undefined) return; // Firebase auth state still loading

    const leaveFrench = (message: string) => {
      toast.error(message);
      router.replace({ pathname: router.pathname, query: router.query }, router.asPath, {
        locale: "en",
      });
    };

    if (user === null) {
      leaveFrench(t("navbar.frenchLoginRequired"));
      return;
    }
    if (frenchVerifiedUidRef.current === user.uid) return;

    let cancelled = false;
    axios
      .get(`${LANGUAGE_OTP_BASE}/status/${user.uid}?language=fr`)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.verified) {
          frenchVerifiedUidRef.current = user.uid;
        } else {
          leaveFrench(t("frenchOtp.guardRedirect"));
        }
      })
      .catch(() => {
        // Verification service unreachable: do not change the language here.
      });

    return () => {
      cancelled = true;
    };
  }, [router.locale, user]);

  const currentLanguageLabel =
    LANGUAGES.find((l) => l.code === (router.locale || "en"))?.label || "English";

  return (
    <div className="relative">
      {(isLangDropdownOpen || isDropdownOpen) && (
  <div
    className="fixed inset-0 z-40"
    onClick={() => {
      setIsLangDropdownOpen(false);
      setIsDropdownOpen(false);
    }}
  />
)}
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <div className="flex-shrink-0">
              <a href="/" className="text-xl font-bold text-blue-600">
                <img src={"/logo.png"} alt="" className="h-10 lg:h-16" />
              </a>
            </div>

            <div className="hidden lg:flex items-center flex-1 ml-8 space-x-6">
              <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 whitespace-nowrap">
                <Link href={"/internship"}>
                  <span>{t("navbar.internships")}</span>
                </Link>
              </button>
              <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 whitespace-nowrap">
                <Link href={"/job"}>
                  <span>{t("navbar.jobs")}</span>
                </Link>
              </button>
              <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 whitespace-nowrap">
                <Link href={"/publicspace"}>
                  <span>{t("navbar.publicSpace")}</span>
                </Link>
              </button>
              <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 whitespace-nowrap">
                <Link href={"/friends"} className="flex items-center space-x-1">
                  <Users size={16} />
                  <span>{t("navbar.friends")}</span>
                </Link>
              </button>
              <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 whitespace-nowrap">
                <Link href={"/subscription"}>
                  <span>{t("navbar.plans")}</span>
                </Link>
              </button>
              <button className="flex items-center space-x-1 text-gray-700 hover:text-blue-600 whitespace-nowrap">
                <Link href={"/resume"}>
                  <span>{t("navbar.resume")}</span>
                </Link>
              </button>

              <div className="flex items-center bg-gray-100 rounded-full px-4 py-2 flex-1 min-w-[120px] max-w-xs">
                <Search size={16} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder={t("navbar.searchPlaceholder") || "Search opportunities..."}
                  className="ml-2 bg-transparent focus:outline-none text-sm w-full"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2 sm:space-x-4 ml-auto lg:ml-6">
              <div className="relative">
                <button
                  onClick={() => {
  const opening = !isLangDropdownOpen;
  setIsLangDropdownOpen(opening);

  if (opening) {
    setIsDropdownOpen(false);
  }
}}
                  aria-label={t("navbar.language") || "Language"}
                  aria-expanded={isLangDropdownOpen}
                  className="flex items-center gap-1 p-2 text-gray-600 hover:text-blue-600"
                >
                  <Globe size={18} />
                  <span className="hidden sm:inline text-xs font-medium">
                    {currentLanguageLabel}
                  </span>
                </button>
                {isLangDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-40 bg-white rounded-md shadow-lg border border-gray-200 z-50">
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang.code}
                        onClick={() => handleLanguageSelect(lang.code)}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${
                          (router.locale || "en") === lang.code
                            ? "text-blue-600 font-medium"
                            : "text-gray-700"
                        }`}
                      >
                        {lang.label}
                        {lang.code === "fr" && (
                          <span className="ml-1 text-[10px] text-gray-400">
                            {t("navbar.otpTag")}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {user && (
                <div className="relative">
                  <button
                    onClick={handleToggleDropdown}
                    aria-label={t("navbar.toggleNotifications")}
                    aria-expanded={isDropdownOpen}
                    className="relative p-2 text-gray-600 hover:text-blue-600"
                  >
                    <Bell size={20} />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] leading-none rounded-full px-1.5 py-1">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-white rounded-md shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
                      <div className="px-4 py-2 border-b border-gray-100 font-medium text-sm text-gray-900">
                        {t("navbar.notifications")}
                      </div>
                      {isLoadingNotifications && (
                        <p className="px-4 py-3 text-sm text-gray-500">
                          {t("common.loading")}
                        </p>
                      )}
                      {!isLoadingNotifications && notifications.length === 0 && (
                        <p className="px-4 py-3 text-sm text-gray-500">
                          {t("navbar.noNotifications")}
                        </p>
                      )}
                      {!isLoadingNotifications &&
                        notifications.filter((n) => !n.isRead).map((n) => (
                          <button
                            key={n._id}
                            onClick={() => handleNotificationClick(n)}
                            className={`w-full text-left px-4 py-3 flex items-start gap-2 hover:bg-gray-50 border-b border-gray-50 ${
                              n.isRead ? "bg-white" : "bg-blue-50"
                            }`}
                          >
                            {n.sender?.photo ? (
                              <img
                                src={n.sender.photo}
                                alt={n.sender.name}
                                className="w-8 h-8 rounded-full"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gray-200" />
                            )}
                            <div>
                              <p className="text-sm text-gray-800">{n.message}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {new Date(n.createdAt).toLocaleString()}
                              </p>
                            </div>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              )}

              <div className="hidden lg:flex items-center space-x-4">
                {user ? (
                  <div className="relative flex items-center">
                    <button className="flex items-center space-x-2">
                      {" "}
                      <Link href={"/profile"}>
                        <img
                          src={user.photo}
                          alt=""
                          className="w-8 h-8 rounded-full"
                        />
                      </Link>
                    </button>
                    <button
                      className="flex items-center w-full px-4 py-2  text-gray-700  hover:bg-gray-200 rounded-lg"
                      onClick={handlelogout}
                    >
                      {t("navbar.logout")}
                    </button>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={() => setIsAuthModalOpen(true)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                    >
                      {t("navbar.login")}
                    </button>
                    <a
                      href="/adminlogin"
                      className="text-gray-600 hover:text-gray-800"
                    >
                      {t("navbar.admin")}
                    </a>
                  </>
                )}
              </div>

              {!user && (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="lg:hidden bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  {t("navbar.login")}
                </button>
              )}

              <button
                onClick={() => setIsMobileMenuOpen((prev) => !prev)}
                aria-label={t("navbar.toggleMenu")}
                aria-expanded={isMobileMenuOpen}
                className="lg:hidden p-2 text-gray-700 hover:text-blue-600"
              >
                {isMobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white">
            <div className="px-4 py-3 space-y-1">
              <Link
                href={"/internship"}
                onClick={closeMobileMenu}
                className="block px-3 py-3 rounded-md text-gray-700 hover:bg-gray-100 hover:text-blue-600 text-base"
              >
                {t("navbar.internships")}
              </Link>
              <Link
                href={"/job"}
                onClick={closeMobileMenu}
                className="block px-3 py-3 rounded-md text-gray-700 hover:bg-gray-100 hover:text-blue-600 text-base"
              >
                {t("navbar.jobs")}
              </Link>
              <Link
                href={"/publicspace"}
                onClick={closeMobileMenu}
                className="block px-3 py-3 rounded-md text-gray-700 hover:bg-gray-100 hover:text-blue-600 text-base"
              >
                {t("navbar.publicSpace")}
              </Link>
              <Link
                href={"/friends"}
                onClick={closeMobileMenu}
                className="flex items-center gap-2 px-3 py-3 rounded-md text-gray-700 hover:bg-gray-100 hover:text-blue-600 text-base"
              >
                <Users size={18} />
                {t("navbar.friends")}
              </Link>
              <Link
                href={"/subscription"}
                onClick={closeMobileMenu}
                className="block px-3 py-3 rounded-md text-gray-700 hover:bg-gray-100 hover:text-blue-600 text-base"
              >
                {t("navbar.plans")}
              </Link>
              <Link
                href={"/resume"}
                onClick={closeMobileMenu}
                className="block px-3 py-3 rounded-md text-gray-700 hover:bg-gray-100 hover:text-blue-600 text-base"
              >
                {t("navbar.resume")}
              </Link>

              <div className="flex items-center bg-gray-100 rounded-full px-4 py-2 mx-1 my-2">
                <Search size={16} className="text-gray-400 flex-shrink-0" />
                <input
                  type="text"
                  placeholder={t("navbar.searchPlaceholder") || "Search opportunities..."}
                  className="ml-2 bg-transparent focus:outline-none text-sm w-full"
                />
              </div>

              <div className="border-t border-gray-100 pt-3 mt-2">
                {user ? (
                  <div className="flex items-center justify-between px-3 py-2">
                    <Link
                      href={"/profile"}
                      onClick={closeMobileMenu}
                      className="flex items-center gap-2"
                    >
                      <img
                        src={user.photo}
                        alt=""
                        className="w-9 h-9 rounded-full"
                      />
                      <span className="text-sm text-gray-800">{user.name}</span>
                    </Link>
                    <button
                      onClick={() => {
                        handlelogout();
                        closeMobileMenu();
                      }}
                      className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg text-sm"
                    >
                      {t("navbar.logout")}
                    </button>
                  </div>
                ) : (
                  <div className="px-3">
                    <a
                      href="/adminlogin"
                      onClick={closeMobileMenu}
                      className="block text-center text-gray-600 hover:text-gray-800 py-2"
                    >
                      {t("navbar.admin")}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onGoogleLogin={handlelogin}
      />

      {user?.uid && user?.email && (
        <FrenchOtpModal
          isOpen={isFrenchOtpOpen}
          firebaseUid={user.uid}
          email={user.email}
          onClose={() => setIsFrenchOtpOpen(false)}
          onVerified={handleFrenchVerified}
        />
      )}
    </div>
  );
};

export default Navbar;
