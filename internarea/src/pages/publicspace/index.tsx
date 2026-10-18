import { selectuser, selectMongoUser } from "@/Feature/Userslice";
import {
  Image as ImageIcon,
  Video,
  X,
  Loader2,
  Upload,
  Heart,
  MessageCircle,
  Share2,
  Trash2,
  Undo2,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
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

const UPLOAD_URL = "http://localhost:5000/api/upload";
const POST_URL = "http://localhost:5000/api/post";
const FEED_URL = "http://localhost:5000/api/post";
const FRIEND_BASE = "http://localhost:5000/api/friend";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB, mirrors backend limit (Step 12)
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

interface PostUser {
  _id: string;
  name: string;
  email: string;
  photo: string;
  firebaseUid: string;
}

interface Comment {
  _id: string;
  user: PostUser;
  text: string;
  createdAt: string;
}

interface Post {
  _id: string;
  user: PostUser;
  mediaUrl: string;
  mediaType: "photo" | "video";
  caption?: string;
  likes: string[];
  comments: Comment[];
  shareCount: number;
  createdAt: string;
}

interface FriendUser {
  _id: string;
  name: string;
  email: string;
  photo: string;
  firebaseUid: string;
}

interface SentShare {
  shareId: string;
  recipientName: string;
}

const index = () => {
  const { t } = useTranslation("common");
  const user = useSelector(selectuser);
  const mongoUser = useSelector(selectMongoUser);

  const [caption, setCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"photo" | "video" | null>(null);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<"idle" | "uploading" | "creating">(
    "idle"
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);

  const [shareModalPostId, setShareModalPostId] = useState<string | null>(null);
  const [shareFriends, setShareFriends] = useState<FriendUser[]>([]);
  const [isLoadingShareFriends, setIsLoadingShareFriends] = useState(false);
  const [sharingToFirebaseUid, setSharingToFirebaseUid] = useState<string | null>(
    null
  );

  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Shares sent during this session, per post, so the sender can unsend
  // them before the recipient has viewed the notification. See note in
  // chat: no backend listing endpoint was requested for this, so this is
  // populated only from shares made in the current session.
  const [sentShares, setSentShares] = useState<Record<string, SentShare[]>>({});
  const [unsendingShareId, setUnsendingShareId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const fetchFeed = async () => {
    try {
      setIsLoadingFeed(true);
      const res = await axios.get(FEED_URL);
      setPosts(res.data);
    } catch (error) {
      console.log(error);
      toast.error(t("publicspace.toasts.feedLoadError"));
    } finally {
      setIsLoadingFeed(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return t("publicspace.errors.unsupportedFileType");
    }
    if (file.size > MAX_FILE_SIZE) {
      return t("publicspace.errors.fileTooLarge");
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    const validationError = validateFile(file);
    if (validationError) {
      setFormError(validationError);
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setPreviewType(null);
      e.target.value = "";
      return;
    }

    setFormError("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    setPreviewType(file.type.startsWith("video/") ? "video" : "photo");
  };

  const handleRemoveFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setPreviewType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const resetForm = () => {
    setCaption("");
    handleRemoveFile();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!user?.uid) {
      setFormError(t("publicspace.errors.loginToPost"));
      return;
    }

    if (!selectedFile) {
      setFormError(t("publicspace.errors.selectMediaRequired"));
      return;
    }
    const validationError = validateFile(selectedFile);
    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);

      setSubmitStage("uploading");
      const formData = new FormData();
      formData.append("media", selectedFile);
      const uploadRes = await axios.post(UPLOAD_URL, formData);
      const { mediaUrl, mediaType } = uploadRes.data;

      setSubmitStage("creating");
      await axios.post(POST_URL, {
        firebaseUid: user.uid,
        mediaUrl,
        mediaType,
        caption,
      });

      toast.success(t("publicspace.toasts.postCreated"));
      resetForm();
      await fetchFeed();
    } catch (error: any) {
      console.log(error);
      const backendMessage = error?.response?.data?.error;
      if (backendMessage) {
        toast.error(backendMessage);
        setFormError(backendMessage);
      } else {
        toast.error(t("publicspace.errors.genericPostError"));
        setFormError(t("publicspace.errors.genericPostError"));
      }
    } finally {
      setIsSubmitting(false);
      setSubmitStage("idle");
    }
  };

  const submitButtonLabel = () => {
    if (submitStage === "uploading") return t("publicspace.uploadingMedia");
    if (submitStage === "creating") return t("publicspace.creatingPost");
    return t("publicspace.postButton");
  };

  const isLikedByMe = (post: Post): boolean => {
    if (!mongoUser?._id) return false;
    return post.likes.includes(mongoUser._id);
  };

  const isOwnedByMe = (post: Post): boolean => {
    if (!user?.uid) return false;
    return post.user?.firebaseUid === user.uid;
  };

  const handleLike = async (postId: string) => {
    if (!user?.uid) {
      toast.error(t("publicspace.errors.loginToLike"));
      return;
    }
    try {
      setLikingPostId(postId);
      const res = await axios.put(`${FEED_URL}/${postId}/like`, {
        firebaseUid: user.uid,
      });
      const updatedPost = res.data.post;
      setPosts((prevPosts) =>
        prevPosts.map((p) => (p._id === postId ? updatedPost : p))
      );
    } catch (error: any) {
      console.log(error);
      toast.error(error?.response?.data?.error || t("publicspace.toasts.likeUpdateError"));
    } finally {
      setLikingPostId(null);
    }
  };

  const handleCommentInputChange = (postId: string, value: string) => {
    setCommentDrafts((prev) => ({ ...prev, [postId]: value }));
  };

  const handleCommentSubmit = async (postId: string) => {
    if (!user?.uid) {
      toast.error(t("publicspace.errors.loginToComment"));
      return;
    }
    const text = (commentDrafts[postId] || "").trim();
    if (!text) {
      toast.error(t("publicspace.errors.commentEmpty"));
      return;
    }
    try {
      setCommentingPostId(postId);
      const res = await axios.post(`${FEED_URL}/${postId}/comment`, {
        firebaseUid: user.uid,
        text,
      });
      const updatedPost = res.data.post;
      setPosts((prevPosts) =>
        prevPosts.map((p) => (p._id === postId ? updatedPost : p))
      );
      setCommentDrafts((prev) => ({ ...prev, [postId]: "" }));
    } catch (error: any) {
      console.log(error);
      toast.error(error?.response?.data?.error || t("publicspace.toasts.commentPostError"));
    } finally {
      setCommentingPostId(null);
    }
  };

  const handleOpenShareModal = async (postId: string) => {
    if (!user?.uid) {
      toast.error(t("publicspace.errors.loginToShare"));
      return;
    }
    setShareModalPostId(postId);
    try {
      setIsLoadingShareFriends(true);
      const res = await axios.get(`${FRIEND_BASE}/list/${user.uid}`);
      setShareFriends(res.data);
    } catch (error) {
      console.log(error);
      toast.error(t("publicspace.toasts.friendsListError"));
    } finally {
      setIsLoadingShareFriends(false);
    }
  };

  const handleCloseShareModal = () => {
    setShareModalPostId(null);
    setShareFriends([]);
  };

  const handleShareToFriend = async (postId: string, recipientFirebaseUid: string) => {
    if (!user?.uid) {
      toast.error(t("publicspace.errors.loginToShare"));
      return;
    }
    try {
      setSharingToFirebaseUid(recipientFirebaseUid);
      const res = await axios.put(`${FEED_URL}/${postId}/share`, {
        firebaseUid: user.uid,
        recipientFirebaseUid,
      });
      const updatedPost = res.data.post;
      setPosts((prevPosts) =>
        prevPosts.map((p) => (p._id === postId ? updatedPost : p))
      );

      const recipientFriend = shareFriends.find(
        (f) => f.firebaseUid === recipientFirebaseUid
      );
      const newShareId = res.data.share?._id;
      if (newShareId) {
        setSentShares((prev) => ({
          ...prev,
          [postId]: [
            ...(prev[postId] || []),
            {
              shareId: newShareId,
              recipientName: recipientFriend?.name || t("publicspace.yourFriendFallback"),
            },
          ],
        }));
      }

      toast.success(t("publicspace.toasts.postShared"));
      handleCloseShareModal();
    } catch (error: any) {
      console.log(error);
      toast.error(error?.response?.data?.error || t("publicspace.toasts.shareError"));
    } finally {
      setSharingToFirebaseUid(null);
    }
  };

  const handleUnsendShare = async (postId: string, shareId: string) => {
    if (!user?.uid) {
      toast.error(t("publicspace.errors.loginToUnsend"));
      return;
    }
    const confirmed = window.confirm(t("publicspace.confirmUnsendShare"));
    if (!confirmed) {
      return;
    }
    try {
      setUnsendingShareId(shareId);
      await axios.delete(`${FEED_URL}/share/${shareId}`, {
        data: { firebaseUid: user.uid },
      });
      setSentShares((prev) => ({
        ...prev,
        [postId]: (prev[postId] || []).filter((s) => s.shareId !== shareId),
      }));
      setPosts((prevPosts) =>
        prevPosts.map((p) =>
          p._id === postId ? { ...p, shareCount: Math.max(0, p.shareCount - 1) } : p
        )
      );
      toast.success(t("publicspace.toasts.shareUnsent"));
    } catch (error: any) {
      console.log(error);
      toast.error(error?.response?.data?.error || t("publicspace.toasts.unsendError"));
    } finally {
      setUnsendingShareId(null);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user?.uid) {
      toast.error(t("publicspace.errors.loginToDelete"));
      return;
    }
    const confirmed = window.confirm(t("publicspace.confirmDeletePost"));
    if (!confirmed) {
      return;
    }
    try {
      setDeletingPostId(postId);
      await axios.delete(`${FEED_URL}/${postId}`, {
        data: { firebaseUid: user.uid },
      });
      setPosts((prevPosts) => prevPosts.filter((p) => p._id !== postId));
      toast.success(t("publicspace.toasts.postDeleted"));
    } catch (error: any) {
      console.log(error);
      toast.error(error?.response?.data?.error || t("publicspace.toasts.deleteError"));
    } finally {
      setDeletingPostId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{t("publicspace.title")}</h1>
            <p className="mt-2 text-sm text-gray-600">
              {t("publicspace.subtitle")}
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("publicspace.captionLabel")}
              </label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                className="text-black mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder={t("publicspace.captionPlaceholder")}
              />
            </div>

            {!previewUrl && (
              <div>
                <label className="flex items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-md py-8 cursor-pointer hover:border-blue-500 text-gray-500">
                  <Upload className="h-5 w-5" />
                  <span className="text-sm">{t("publicspace.selectMedia")}</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            )}

            {previewUrl && (
              <div className="relative border border-gray-200 rounded-md p-2">
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="absolute top-2 right-2 bg-white rounded-full p-1 shadow hover:bg-gray-100"
                >
                  <X className="h-4 w-4 text-gray-700" />
                </button>
                {previewType === "photo" ? (
                  <img
                    src={previewUrl}
                    alt={t("publicspace.selectedPreviewAlt")}
                    className="max-h-80 w-full object-contain rounded-md"
                  />
                ) : (
                  <video
                    src={previewUrl}
                    controls
                    className="max-h-80 w-full rounded-md"
                  />
                )}
                <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                  {previewType === "photo" ? (
                    <ImageIcon className="h-3 w-3" />
                  ) : (
                    <Video className="h-3 w-3" />
                  )}
                  {selectedFile?.name}
                </div>
              </div>
            )}

            {formError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {formError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="flex items-center">
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    {submitButtonLabel()}
                  </div>
                ) : (
                  t("publicspace.postButton")
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-6">
          {isLoadingFeed && (
            <p className="text-center text-sm text-gray-500">{t("publicspace.loadingFeed")}</p>
          )}

          {!isLoadingFeed && posts.length === 0 && (
            <p className="text-center text-sm text-gray-500">
              {t("publicspace.noPostsYet")}
            </p>
          )}

          {posts.map((post) => (
            <div
              key={post._id}
              className="bg-white rounded-lg shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  {post.user?.photo ? (
                    <img
                      src={post.user.photo}
                      alt={post.user.name}
                      className="w-9 h-9 rounded-full"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gray-200" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {post.user?.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(post.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {isOwnedByMe(post) && (
                  <button
                    onClick={() => handleDeletePost(post._id)}
                    disabled={deletingPostId === post._id}
                    className="text-gray-400 hover:text-red-600 disabled:opacity-50"
                    title={t("publicspace.deletePostTitle")}
                  >
                    {deletingPostId === post._id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                )}
              </div>

              {post.mediaType === "photo" ? (
                <img
                  src={post.mediaUrl}
                  alt={t("publicspace.postMediaAlt")}
                  className="w-full max-h-96 object-contain bg-black"
                />
              ) : (
                <video
                  src={post.mediaUrl}
                  controls
                  className="w-full max-h-96 bg-black"
                />
              )}

              {post.caption && (
                <p className="px-4 py-3 text-sm text-gray-800">{post.caption}</p>
              )}

              <div className="flex items-center gap-4 px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
                <button
                  onClick={() => handleLike(post._id)}
                  disabled={likingPostId === post._id}
                  className={`flex items-center gap-1 disabled:opacity-50 ${
                    isLikedByMe(post) ? "text-red-600" : "text-gray-500 hover:text-red-600"
                  }`}
                >
                  <Heart
                    className="h-4 w-4"
                    fill={isLikedByMe(post) ? "currentColor" : "none"}
                  />
                  {t("publicspace.likeCount", { count: post.likes.length })}
                </button>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-4 w-4" />
                  {t("publicspace.commentCount", { count: post.comments.length })}
                </span>
                <button
                  onClick={() => handleOpenShareModal(post._id)}
                  className="flex items-center gap-1 text-gray-500 hover:text-blue-600"
                >
                  <Share2 className="h-4 w-4" />
                  {t("publicspace.shareCount", { count: post.shareCount })}
                </button>
              </div>

              {(sentShares[post._id] || []).length > 0 && (
                <div className="px-4 py-3 border-t border-gray-100 space-y-2">
                  <p className="text-xs font-medium text-gray-500">
                    {t("publicspace.sharesSentLabel")}
                  </p>
                  {(sentShares[post._id] || []).map((s) => (
                    <div
                      key={s.shareId}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="text-gray-700">{t("publicspace.sharedTo")} {s.recipientName}</span>
                      <button
                        onClick={() => handleUnsendShare(post._id, s.shareId)}
                        disabled={unsendingShareId === s.shareId}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 border border-gray-300 rounded-md hover:bg-gray-100 disabled:opacity-50"
                      >
                        {unsendingShareId === s.shareId ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Undo2 className="h-3 w-3" />
                            {t("publicspace.unsend")}
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-3 border-t border-gray-100 space-y-3">
                {post.comments.length > 0 && (
                  <div className="space-y-2">
                    {post.comments.map((comment) => (
                      <div key={comment._id} className="flex items-start gap-2">
                        {comment.user?.photo ? (
                          <img
                            src={comment.user.photo}
                            alt={comment.user.name}
                            className="w-6 h-6 rounded-full mt-0.5"
                          />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-gray-200 mt-0.5" />
                        )}
                        <div className="bg-gray-100 rounded-md px-3 py-1.5 flex-1">
                          <p className="text-xs font-medium text-gray-900">
                            {comment.user?.name || t("publicspace.unknownUser")}
                          </p>
                          <p className="text-sm text-gray-800">{comment.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={commentDrafts[post._id] || ""}
                    onChange={(e) =>
                      handleCommentInputChange(post._id, e.target.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleCommentSubmit(post._id);
                      }
                    }}
                    placeholder={t("publicspace.commentPlaceholder")}
                    disabled={commentingPostId === post._id}
                    className="text-black flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <button
                    onClick={() => handleCommentSubmit(post._id)}
                    disabled={commentingPostId === post._id}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {commentingPostId === post._id ? (
                      <Loader2 className="animate-spin h-4 w-4" />
                    ) : (
                      t("publicspace.commentSubmit")
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {shareModalPostId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {t("publicspace.shareThisPost")}
              </h2>
              <button
                onClick={handleCloseShareModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {isLoadingShareFriends && (
              <p className="text-sm text-gray-500">{t("publicspace.loadingFriends")}</p>
            )}

            {!isLoadingShareFriends && shareFriends.length === 0 && (
              <p className="text-sm text-gray-500">
                {t("publicspace.noFriendsToShare")}
              </p>
            )}

            {!isLoadingShareFriends && shareFriends.length > 0 && (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {shareFriends.map((friend) => (
                  <div
                    key={friend._id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
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
                      onClick={() =>
                        handleShareToFriend(shareModalPostId, friend.firebaseUid)
                      }
                      disabled={sharingToFirebaseUid === friend.firebaseUid}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {sharingToFirebaseUid === friend.firebaseUid ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        t("publicspace.shareButton")
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default index;