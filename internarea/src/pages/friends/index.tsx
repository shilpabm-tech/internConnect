import { selectuser } from "@/Feature/Userslice";
import { UserPlus, UserMinus, Check, X, Loader2, Users } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import axios from "axios";
import { toast } from "react-toastify";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

export async function getStaticProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

const FRIEND_BASE = "http://localhost:5000/api/friend";

interface FriendUser {
  _id: string;
  name: string;
  email: string;
  photo: string;
  firebaseUid: string;
}

// Mirrors backend/utils/postLimit.js purely for display purposes.
// The backend (Step 11) remains the sole authority when a post is actually created.
function estimateDailyLimit(friendCount: number, t: (key: string) => string): string {
  if (friendCount === 0) return t("friends.limitCannotPost");
  if (friendCount > 10) return t("friends.limitUnlimited");
  return String(friendCount);
}

const index = () => {
  const { t } = useTranslation("common");
  const user = useSelector(selectuser);

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incoming, setIncoming] = useState<FriendUser[]>([]);
  const [outgoing, setOutgoing] = useState<FriendUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [targetUid, setTargetUid] = useState("");
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [actioningUid, setActioningUid] = useState<string | null>(null);

  const fetchAll = async () => {
    if (!user?.uid) return;
    try {
      setIsLoading(true);
      const [friendsRes, requestsRes] = await Promise.all([
        axios.get(`${FRIEND_BASE}/list/${user.uid}`),
        axios.get(`${FRIEND_BASE}/requests/${user.uid}`),
      ]);
      setFriends(friendsRes.data);
      setIncoming(requestsRes.data.incoming);
      setOutgoing(requestsRes.data.outgoing);
    } catch (error) {
      console.log(error);
      toast.error(t("friends.toasts.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.uid) {
      toast.error(t("friends.toasts.loginRequiredToSend"));
      return;
    }
    if (!targetUid.trim()) {
      toast.error(t("friends.toasts.uidRequired"));
      return;
    }
    try {
      setIsSendingRequest(true);
      const res = await axios.post(`${FRIEND_BASE}/request`, {
        fromFirebaseUid: user.uid,
        toFirebaseUid: targetUid.trim(),
      });
      if (res.data.status === "auto-accepted") {
        toast.success(t("friends.toasts.nowFriends"));
      } else {
        toast.success(t("friends.toasts.requestSent"));
      }
      setTargetUid("");
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("friends.toasts.sendRequestError"));
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleAccept = async (requesterUid: string) => {
    if (!user?.uid) return;
    try {
      setActioningUid(requesterUid);
      await axios.post(`${FRIEND_BASE}/accept`, {
        firebaseUid: user.uid,
        requesterFirebaseUid:requesterUid,
      });
      toast.success(t("friends.toasts.requestAccepted"));
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("friends.toasts.acceptError"));
    } finally {
      setActioningUid(null);
    }
  };

  const handleReject = async (requesterUid: string) => {
    if (!user?.uid) return;
    try {
      setActioningUid(requesterUid);
      await axios.post(`${FRIEND_BASE}/reject`, {
        firebaseUid: user.uid,
        requesterFirebaseUid:requesterUid,
      });
      toast.success(t("friends.toasts.requestRejected"));
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("friends.toasts.rejectError"));
    } finally {
      setActioningUid(null);
    }
  };

  const handleCancel = async (toUid: string) => {
    if (!user?.uid) return;
    try {
      setActioningUid(toUid);
      await axios.post(`${FRIEND_BASE}/cancel`, {
        firebaseUid: user.uid,
        targetFirebaseUid: toUid,
      });
      toast.success(t("friends.toasts.requestCancelled"));
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("friends.toasts.cancelError"));
    } finally {
      setActioningUid(null);
    }
  };

  const handleUnfriend = async (friendUid: string) => {
    if (!user?.uid) return;
    try {
      setActioningUid(friendUid);
      await axios.post(`${FRIEND_BASE}/unfriend`, {
        firebaseUid: user.uid,
        friendFirebaseUid: friendUid,
      });
      toast.success(t("friends.toasts.unfriended"));
      await fetchAll();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t("friends.toasts.unfriendError"));
    } finally {
      setActioningUid(null);
    }
  };

  if (!user?.uid) {
    return (
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-2xl mx-auto px-4 text-center text-gray-600">
          {t("friends.loginRequired")}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">{t("friends.title")}</h1>
          </div>
          <p className="text-sm text-gray-600">
            {t("friends.friendCount", { count: friends.length })}{" "}
            {t("friends.dailyLimitLabel")}{" "}
            <span className="font-semibold">{estimateDailyLimit(friends.length, t)}</span>.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {t("friends.sendRequestTitle")}
          </h2>
          <form onSubmit={handleSendRequest} className="flex gap-2">
            <input
              type="text"
              value={targetUid}
              onChange={(e) => setTargetUid(e.target.value)}
              placeholder={t("friends.uidPlaceholder")}
              className="text-black flex-1 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <button
              type="submit"
              disabled={isSendingRequest}
              className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSendingRequest ? (
                <Loader2 className="animate-spin h-4 w-4" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              {t("friends.send")}
            </button>
          </form>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-gray-500">{t("common.loading")}</p>
        ) : (
          <>
            {incoming.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  {t("friends.incomingRequests")}
                </h2>
                <div className="space-y-3">
                  {incoming.map((requester) => (
                    <div
                      key={requester._id}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {requester.photo ? (
                          <img
                            src={requester.photo}
                            alt={requester.name}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200" />
                        )}
                        <span className="text-sm text-gray-900">{requester.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAccept(requester.firebaseUid)}
                          disabled={actioningUid === requester.firebaseUid}
                          className="p-2 bg-green-100 text-green-700 rounded-md hover:bg-green-200 disabled:opacity-50"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleReject(requester.firebaseUid)}
                          disabled={actioningUid === requester.firebaseUid}
                          className="p-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {outgoing.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">
                  {t("friends.sentRequests")}
                </h2>
                <div className="space-y-3">
                  {outgoing.map((target) => (
                    <div key={target._id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {target.photo ? (
                          <img
                            src={target.photo}
                            alt={target.name}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200" />
                        )}
                        <span className="text-sm text-gray-900">{target.name}</span>
                      </div>
                      <button
                        onClick={() => handleCancel(target.firebaseUid)}
                        disabled={actioningUid === target.firebaseUid}
                        className="text-xs px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-3">
                {t("friends.yourFriends")}
              </h2>
              {friends.length === 0 ? (
                <p className="text-sm text-gray-500">{t("friends.noFriendsYet")}</p>
              ) : (
                <div className="space-y-3">
                  {friends.map((friend) => (
                    <div key={friend._id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {friend.photo ? (
                          <img
                            src={friend.photo}
                            alt={friend.name}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200" />
                        )}
                        <span className="text-sm text-gray-900">{friend.name}</span>
                      </div>
                      <button
                        onClick={() => handleUnfriend(friend.firebaseUid)}
                        disabled={actioningUid === friend.firebaseUid}
                        className="inline-flex items-center gap-1 text-xs px-3 py-1 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
                      >
                        <UserMinus className="h-3 w-3" />
                        {t("friends.unfriend")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default index;