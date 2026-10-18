import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import { toast } from "react-toastify";
import { useTranslation } from "next-i18next/pages";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";

export async function getServerSideProps({ locale }: { locale: string }) {
  return {
    props: {
      ...(await serverSideTranslations(locale, ["common"])),
    },
  };
}

const POST_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/post`;

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

const PostDetail = () => {
  const { t } = useTranslation("common");
  const router = useRouter();
  const { id } = router.query;

  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const fetchPost = async () => {
      try {
        setIsLoading(true);
        const res = await axios.get(`${POST_URL}/${id}`);
        setPost(res.data);
      } catch (error) {
        console.log(error);
        toast.error(t("publicspace.toasts.postLoadError"));
      } finally {
        setIsLoading(false);
      }
    };
    fetchPost();
  }, [id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 text-center text-sm text-gray-500">
        {t("publicspace.loadingPost")}
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 text-center text-sm text-gray-500">
        {t("publicspace.postNotFound")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-4">
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
              <p className="text-sm font-medium text-gray-900">{post.user?.name}</p>
              <p className="text-xs text-gray-500">
                {new Date(post.createdAt).toLocaleString()}
              </p>
            </div>
          </div>

          {post.mediaType === "photo" ? (
            <img
              src={post.mediaUrl}
              alt={t("publicspace.postMediaAlt")}
              className="w-full max-h-[32rem] object-contain bg-black"
            />
          ) : (
            <video
              src={post.mediaUrl}
              controls
              className="w-full max-h-[32rem] bg-black"
            />
          )}

          {post.caption && (
            <p className="px-4 py-3 text-sm text-gray-800">{post.caption}</p>
          )}

          <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
            {t("publicspace.likeCount", { count: post.likes.length })} ·{" "}
            {t("publicspace.commentCount", { count: post.comments.length })} ·{" "}
            {t("publicspace.shareCount", { count: post.shareCount })}
          </div>

          {post.comments.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 space-y-2">
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
        </div>
      </div>
    </div>
  );
};

export default PostDetail;