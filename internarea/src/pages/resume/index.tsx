import { selectuser } from "@/Feature/Userslice";
import Link from "next/link";
import React, { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "react-toastify";
import { Loader2, Upload, CheckCircle2, FileText } from "lucide-react";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

const RESUME_BASE = "http://localhost:5000/api/resume";
const SUB_BASE = "http://localhost:5000/api/subscription";
const UPLOAD_URL = "http://localhost:5000/api/upload";
const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const RESUME_FEE_DISPLAY = 50;

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${RAZORPAY_SCRIPT_SRC}"]`)) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

interface EducationEntry {
  degree: string;
  institution: string;
  startYear: string;
  endYear: string;
  description: string;
}
interface ExperienceEntry {
  role: string;
  company: string;
  startDate: string;
  endDate: string;
  description: string;
}
interface ProjectEntry {
  title: string;
  description: string;
  link: string;
}

type Stage = "checking" | "not_eligible" | "form" | "otp" | "payment" | "done";

const ResumePage = () => {
  const { t } = useTranslation("common");
  const user = useSelector(selectuser);

  const [stage, setStage] = useState<Stage>("checking");
  const [resumeId, setResumeId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [summary, setSummary] = useState("");
  const [skillsInput, setSkillsInput] = useState("");
  const [education, setEducation] = useState<EducationEntry[]>([
    { degree: "", institution: "", startYear: "", endYear: "", description: "" },
  ]);
  const [experience, setExperience] = useState<ExperienceEntry[]>([
    { role: "", company: "", startDate: "", endDate: "", description: "" },
  ]);
  const [projects, setProjects] = useState<ProjectEntry[]>([
    { title: "", description: "", link: "" },
  ]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [otpCode, setOtpCode] = useState("");
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [otpDeliveryMessage, setOtpDeliveryMessage] = useState("");

  const [finalPdfUrl, setFinalPdfUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const checkEligibility = async () => {
      if (!user?.uid) return;
      try {
        const res = await axios.get(`${SUB_BASE}/current/${user.uid}`);
        if (res.data.subscriptionPlan === "free") {
          setStage("not_eligible");
        } else {
          setStage("form");
        }
      } catch (error) {
        console.log(error);
        toast.error(t("resume.toasts.eligibilityCheckError"));
      }
    };
    checkEligibility();
  }, [user?.uid]);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsUploadingPhoto(true);
      const formData = new FormData();
      formData.append("media", file);
      const res = await axios.post(UPLOAD_URL, formData);
      setPhotoUrl(res.data.mediaUrl);
      toast.success(t("resume.toasts.photoUploaded"));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("resume.toasts.photoUploadError"));
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const updateEducation = (index: number, field: keyof EducationEntry, value: string) => {
    setEducation((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };
  const updateExperience = (index: number, field: keyof ExperienceEntry, value: string) => {
    setExperience((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };
  const updateProject = (index: number, field: keyof ProjectEntry, value: string) => {
    setProjects((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmitDetailsAndRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) {
      toast.error(t("resume.errors.loginRequired"));
      return;
    }
    if (!name.trim() || !email.trim()) {
      toast.error(t("resume.errors.nameEmailRequired"));
      return;
    }

    try {
      setIsSubmittingForm(true);

      const otpRes = await axios.post(`${RESUME_BASE}/request-otp`, {
        firebaseUid: user.uid,
      });
      const newResumeId = otpRes.data.resumeId;
      setResumeId(newResumeId);
      setOtpDeliveryMessage(otpRes.data.message);

      await axios.post(`${RESUME_BASE}/details`, {
        firebaseUid: user.uid,
        resumeId: newResumeId,
        name,
        email,
        phone,
        address,
        github,
        linkedin,
        summary,
        education,
        skills: skillsInput
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        experience,
        projects,
        photoUrl,
      });

      toast.success(otpRes.data.message);
      setStage("otp");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("resume.toasts.startResumeError"));
    } finally {
      setIsSubmittingForm(false);
    }
  };

  const handleResendOtp = async () => {
    if (!user?.uid) return;
    try {
      setIsRequestingOtp(true);
      const res = await axios.post(`${RESUME_BASE}/request-otp`, {
        firebaseUid: user.uid,
      });
      setResumeId(res.data.resumeId);
      setOtpDeliveryMessage(res.data.message);
      toast.success(res.data.message);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("resume.toasts.resendCodeError"));
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid || !resumeId) return;
    if (!otpCode.trim()) {
      toast.error(t("forgotPassword.errors.codeRequired"));
      return;
    }
    try {
      setIsVerifyingOtp(true);
      await axios.post(`${RESUME_BASE}/verify-otp`, {
        firebaseUid: user.uid,
        resumeId,
        code: otpCode.trim(),
      });
      toast.success(t("resume.toasts.codeVerified"));
      setStage("payment");
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("resume.toasts.verifyCodeError"));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handlePay = async () => {
    if (!user?.uid || !resumeId) return;
    try {
      setIsPaying(true);
      const orderRes = await axios.post(`${RESUME_BASE}/create-order`, {
        firebaseUid: user.uid,
        resumeId,
      });
      const { orderId, amount, currency, keyId } = orderRes.data;

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        toast.error(t("subscription.errors.paymentGatewayError"));
        setIsPaying(false);
        return;
      }

      const razorpayOptions = {
        key: keyId,
        amount,
        currency,
        name: "Intern Area",
        description: "Resume Creation Fee",
        order_id: orderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await axios.post(`${RESUME_BASE}/verify-payment`, {
              firebaseUid: user.uid,
              resumeId,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setFinalPdfUrl(verifyRes.data.pdfUrl);
            setStage("done");
            toast.success(t("resume.toasts.paymentSuccess"));
          } catch (verifyError: any) {
            toast.error(
              verifyError?.response?.data?.error ||
                t("subscription.errors.paymentVerificationFailed")
            );
          } finally {
            setIsPaying(false);
          }
        },
        modal: {
          ondismiss: () => {
            setIsPaying(false);
          },
        },
        prefill: {
          name: user.name || "",
          email: user.email || "",
        },
        theme: {
          color: "#2563eb",
        },
      };

      const razorpayInstance = new window.Razorpay(razorpayOptions);
      razorpayInstance.open();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("subscription.errors.paymentStartError"));
      setIsPaying(false);
    }
  };

  if (!user?.uid) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 text-center text-sm text-gray-600">
        {t("resume.loginRequired")}
      </div>
    );
  }

  if (stage === "checking") {
    return (
      <div className="min-h-screen bg-gray-50 py-12 text-center text-sm text-gray-500">
        {t("resume.checkingSubscription")}
      </div>
    );
  }

  if (stage === "not_eligible") {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-md mx-auto px-4 text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">{t("resume.premiumFeatureTitle")}</h1>
          <p className="text-sm text-gray-600 mb-4">
            {t("resume.premiumFeatureDesc")}
          </p>
          <Link href="/subscription" className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">{t("resume.viewPlans")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t("resume.title")}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {t("resume.feeLabel")} <span className="font-semibold">₹{RESUME_FEE_DISPLAY}</span> {t("resume.eligibleNotice")}
          </p>
        </div>

        {stage === "form" && (
          <form
            onSubmit={handleSubmitDetailsAndRequestOtp}
            className="bg-white rounded-lg shadow-sm p-6 space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("resume.photoLabel")}</label>
              {photoUrl ? (
                <div className="flex items-center gap-3">
                  <img src={photoUrl} alt={t("resume.photoAlt")} className="w-16 h-16 rounded-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl(null)}
                    className="text-xs text-red-600 hover:text-red-700"
                  >
                    {t("resume.removePhoto")}
                  </button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-2 border border-dashed border-gray-300 rounded-md px-4 py-2 text-sm text-gray-600 cursor-pointer hover:border-blue-500">
                  {isUploadingPhoto ? (
                    <Loader2 className="animate-spin h-4 w-4" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {t("resume.uploadPhoto")}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoChange}
                  />
                </label>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("auth.fullNamePlaceholder")}
                className="text-black rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("resume.emailPlaceholder")}
                className="text-black rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("resume.phonePlaceholder")}
                className="text-black rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={t("resume.addressPlaceholder")}
                className="text-black rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={github}
                onChange={(e) => setGithub(e.target.value)}
                placeholder={t("resume.githubPlaceholder")}
                className="text-black rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={linkedin}
                onChange={(e) => setLinkedin(e.target.value)}
                placeholder={t("resume.linkedinPlaceholder")}
                className="text-black rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={t("resume.summaryPlaceholder")}
              rows={3}
              className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{t("resume.educationLabel")}</p>
              {education.map((edu, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    value={edu.degree}
                    onChange={(e) => updateEducation(i, "degree", e.target.value)}
                    placeholder={t("resume.degreePlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={edu.institution}
                    onChange={(e) => updateEducation(i, "institution", e.target.value)}
                    placeholder={t("resume.institutionPlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={edu.startYear}
                    onChange={(e) => updateEducation(i, "startYear", e.target.value)}
                    placeholder={t("resume.startYearPlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={edu.endYear}
                    onChange={(e) => updateEducation(i, "endYear", e.target.value)}
                    placeholder={t("resume.endYearPlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setEducation((prev) => [
                    ...prev,
                    { degree: "", institution: "", startYear: "", endYear: "", description: "" },
                  ])
                }
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                + {t("resume.addAnother")}
              </button>
            </div>

            <input
              type="text"
              value={skillsInput}
              onChange={(e) => setSkillsInput(e.target.value)}
              placeholder={t("resume.skillsPlaceholder")}
              className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{t("resume.experienceLabel")}</p>
              {experience.map((exp, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    value={exp.role}
                    onChange={(e) => updateExperience(i, "role", e.target.value)}
                    placeholder={t("resume.rolePlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={exp.company}
                    onChange={(e) => updateExperience(i, "company", e.target.value)}
                    placeholder={t("resume.companyPlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={exp.startDate}
                    onChange={(e) => updateExperience(i, "startDate", e.target.value)}
                    placeholder={t("resume.startDatePlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={exp.endDate}
                    onChange={(e) => updateExperience(i, "endDate", e.target.value)}
                    placeholder={t("resume.endDatePlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={exp.description}
                    onChange={(e) => updateExperience(i, "description", e.target.value)}
                    placeholder={t("resume.descriptionPlaceholder")}
                    className="text-black col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setExperience((prev) => [
                    ...prev,
                    { role: "", company: "", startDate: "", endDate: "", description: "" },
                  ])
                }
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                + {t("resume.addAnother")}
              </button>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{t("resume.projectsLabel")}</p>
              {projects.map((proj, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                  <input
                    value={proj.title}
                    onChange={(e) => updateProject(i, "title", e.target.value)}
                    placeholder={t("resume.projectTitlePlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    value={proj.link}
                    onChange={(e) => updateProject(i, "link", e.target.value)}
                    placeholder={t("resume.linkOptionalPlaceholder")}
                    className="text-black rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <textarea
                    value={proj.description}
                    onChange={(e) => updateProject(i, "description", e.target.value)}
                    placeholder={t("resume.descriptionPlaceholder")}
                    className="text-black col-span-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setProjects((prev) => [...prev, { title: "", description: "", link: "" }])
                }
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                + {t("resume.addAnother")}
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmittingForm}
              className="w-full inline-flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isSubmittingForm ? (
                <Loader2 className="animate-spin h-4 w-4" />
              ) : (
                t("resume.saveAndSendCode")
              )}
            </button>
          </form>
        )}

        {stage === "otp" && (
          <form
            onSubmit={handleVerifyOtp}
            className="bg-white rounded-lg shadow-sm p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-gray-900">{t("resume.verifyEmailTitle")}</h2>
            <p className="text-sm text-gray-600">{otpDeliveryMessage}</p>
            <input
              type="text"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
              placeholder={t("forgotPassword.codePlaceholder")}
              maxLength={6}
              className="text-black w-full rounded-md border border-gray-300 px-3 py-2 text-sm tracking-widest"
            />
            <button
              type="submit"
              disabled={isVerifyingOtp}
              className="w-full inline-flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isVerifyingOtp ? <Loader2 className="animate-spin h-4 w-4" /> : t("forgotPassword.verifyCode")}
            </button>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={isRequestingOtp}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              {isRequestingOtp ? t("resume.resending") : t("resume.resendCode")}
            </button>
          </form>
        )}

        {stage === "payment" && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center space-y-4">
            <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900">{t("resume.emailVerifiedTitle")}</h2>
            <p className="text-sm text-gray-600">
              {t("resume.payToGenerate", { fee: RESUME_FEE_DISPLAY })}
            </p>
            <button
              onClick={handlePay}
              disabled={isPaying}
              className="w-full inline-flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {isPaying ? <Loader2 className="animate-spin h-4 w-4" /> : t("resume.payButton", { fee: RESUME_FEE_DISPLAY })}
            </button>
          </div>
        )}

        {stage === "done" && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center space-y-4">
            <FileText className="h-10 w-10 text-blue-600 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900">{t("resume.resumeReadyTitle")}</h2>
            <p className="text-sm text-gray-600">
              {t("resume.resumeReadyDesc")}
            </p>
            {finalPdfUrl && (
              <Link href={finalPdfUrl} target="_blank" rel="noopener noreferrer" className="inline-block bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700">{t("resume.viewDownload")}</Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumePage;

