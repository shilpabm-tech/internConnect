import { selectuser } from "@/Feature/Userslice";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "react-toastify";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

const SUB_BASE = "http://localhost:5000/api/subscription";
const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

interface Plan {
  key: string;
  label: string;
  price: number;
  limit: number | null;
  unlimited: boolean;
}

interface CurrentStatus {
  subscriptionPlan: string;
  subscriptionExpiresAt: string | null;
  applicationCountThisMonth: number;
  applicationCountMonth: string | null;
  planLabel: string;
  planLimit: number | null;
  unlimited: boolean;
}

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

const SubscriptionPage = () => {
  const { t } = useTranslation("common");
  const user = useSelector(selectuser);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [current, setCurrent] = useState<CurrentStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [subscribingPlan, setSubscribingPlan] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const plansRes = await axios.get(`${SUB_BASE}/plans`);
      setPlans(plansRes.data);

      if (user?.uid) {
        const currentRes = await axios.get(`${SUB_BASE}/current/${user.uid}`);
        setCurrent(currentRes.data);
      }
    } catch (error) {
      console.log(error);
      toast.error(t("subscription.toasts.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleSubscribe = async (planKey: string) => {
    if (!user?.uid) {
      toast.error(t("subscription.errors.loginToSubscribe"));
      return;
    }

    try {
      setSubscribingPlan(planKey);

      const orderRes = await axios.post(`${SUB_BASE}/create-order`, {
        firebaseUid: user.uid,
        plan: planKey,
      });

      const { orderId, amount, currency, keyId } = orderRes.data;

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded || !window.Razorpay) {
        toast.error(t("subscription.errors.paymentGatewayError"));
        setSubscribingPlan(null);
        return;
      }

      const razorpayOptions = {
        key: keyId,
        amount,
        currency,
        name: "Intern Area",
        description: `${planKey.charAt(0).toUpperCase() + planKey.slice(1)} Plan Subscription`,
        order_id: orderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await axios.post(`${SUB_BASE}/verify-payment`, {
              firebaseUid: user.uid,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            toast.success(
              t("subscription.toasts.subscribeSuccess", { plan: verifyRes.data.plan })
            );
            await fetchData();
          } catch (verifyError: any) {
            toast.error(
              verifyError?.response?.data?.error ||
                t("subscription.errors.paymentVerificationFailed")
            );
          } finally {
            setSubscribingPlan(null);
          }
        },
        modal: {
          ondismiss: () => {
            setSubscribingPlan(null);
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
      setSubscribingPlan(null);
    }
  };

  if (!user?.uid) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 text-center text-gray-600">
          {t("subscription.loginRequired")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">{t("subscription.title")}</h1>
          <p className="mt-2 text-sm text-gray-600">
            {t("subscription.subtitle")}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md px-4 py-3 mb-6 flex items-center gap-2 text-sm text-blue-800">
          <Clock className="h-4 w-4 flex-shrink-0" />
          {t("subscription.purchaseWindowNotice")}
        </div>

        {current && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              {t("subscription.currentPlanLabel")} {current.planLabel}
            </h2>
            <p className="text-sm text-gray-600">
              {t("subscription.applicationsUsedLabel")}{" "}
              <span className="font-medium">
                {current.applicationCountThisMonth} /{" "}
                {current.unlimited ? t("subscription.unlimited") : current.planLimit}
              </span>
            </p>
            {current.subscriptionExpiresAt && (
              <p className="text-sm text-gray-600 mt-1">
                {t("subscription.validUntil")}{" "}
                {new Date(current.subscriptionExpiresAt).toLocaleDateString("en-IN")}
              </p>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-sm text-gray-500">{t("subscription.loadingPlans")}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => {
              const isCurrentPlan = current?.subscriptionPlan === plan.key;
              return (
                <div
                  key={plan.key}
                  className={`bg-white rounded-lg shadow-sm p-6 flex flex-col ${
                    isCurrentPlan ? "border-2 border-blue-600" : "border border-gray-200"
                  }`}
                >
                  {isCurrentPlan && (
                    <div className="flex items-center gap-1 text-xs text-blue-600 font-medium mb-2">
                      <CheckCircle2 className="h-3 w-3" />
                      {t("subscription.currentPlanBadge")}
                    </div>
                  )}
                  <h3 className="text-lg font-bold text-gray-900">{plan.label}</h3>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {plan.price === 0 ? t("subscription.free") : `₹${plan.price / 100}`}
                    {plan.price > 0 && (
                      <span className="text-sm font-normal text-gray-500">{t("subscription.perMonth")}</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-600 mt-2 flex-1">
                    {plan.unlimited
                      ? t("subscription.unlimitedApplications")
                      : t("subscription.limitedApplications", { count: plan.limit })}
                  </p>

                  {plan.key !== "free" && !isCurrentPlan && (
                    <button
                      onClick={() => handleSubscribe(plan.key)}
                      disabled={subscribingPlan === plan.key}
                      className="mt-4 w-full inline-flex justify-center items-center py-2 px-4 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {subscribingPlan === plan.key ? (
                        <Loader2 className="animate-spin h-4 w-4" />
                      ) : (
                        t("subscription.subscribeButton")
                      )}
                    </button>
                  )}

                  {plan.key === "free" && (
                    <div className="mt-4 text-xs text-gray-400 text-center">
                      {t("subscription.noPaymentRequired")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionPage;