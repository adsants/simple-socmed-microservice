import React, { useState, useEffect, useRef } from 'react';
import {
  login,
  register,
  getPosts,
  createPost,
  uploadImage,
  loadAuthFromStorage,
  clearAuth,
  toggleLike,
  getLikeCount,
  getComments,
  addComment,
} from './api/client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';
const PAGE_SIZE = 5;

function App() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', email: '', emailOrUsername: '', password: '' });
  const [user, setUser] = useState(null);

  const [posts, setPosts] = useState([]);
  const [likes, setLikes] = useState({});
  const [comments, setCommentsState] = useState({});
  const [commentInput, setCommentInput] = useState({});
  const [imageIndex, setImageIndex] = useState({}); // slider index per post

  const [content, setContent] = useState('');
  const [imageFiles, setImageFiles] = useState([]);
  const [loadingPost, setLoadingPost] = useState(false);
  const [error, setError] = useState('');

  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const loaderRef = useRef(null);
  const observerRef = useRef(null);

  // load auth + first page
  useEffect(() => {
    const stored = loadAuthFromStorage();
    if (stored && stored.user) {
      setUser(stored.user);
      resetAndLoadFirstPage();
    }
  }, []);

  const resetAndLoadFirstPage = async () => {
    setPage(1);
    setHasMore(true);
    setPosts([]);
    setLikes({});
    setCommentsState({});
    await loadPostsWithExtras(1, false);
  };

  const handleChange = (e) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (mode === 'register') {
        await register(form.username, form.email, form.password);
        setMode('login');
      } else {
        const data = await login(form.emailOrUsername, form.password);
        setUser(data.user);
        await resetAndLoadFirstPage();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleLogout = () => {
    clearAuth();
    setUser(null);
    setPosts([]);
    setLikes({});
    setCommentsState({});
    setCommentInput({});
    setImageIndex({});
  };

  const mergePosts = (oldPosts, newPosts) => {
    const map = new Map();
    oldPosts.forEach((p) => map.set(p.id, p));
    newPosts.forEach((p) => map.set(p.id, p));
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  };

  const loadPostsWithExtras = async (targetPage, append) => {
    try {
      if (targetPage === 1 && !append) {
        setLoadingMore(true);
      } else {
        setLoadingMore(true);
      }

      const data = await getPosts(targetPage, PAGE_SIZE);

      setPosts((prev) => (append ? mergePosts(prev, data) : data));
      setHasMore(data.length === PAGE_SIZE);

      // load likes & comments untuk page ini
      data.forEach(async (p) => {
        try {
          const likeRes = await getLikeCount(p.id);
          setLikes((prev) => ({ ...prev, [p.id]: likeRes.count }));
        } catch {}
        try {
          const commentList = await getComments(p.id);
          setCommentsState((prev) => ({ ...prev, [p.id]: commentList }));
        } catch {}
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    const nextPage = page + 1;
    await loadPostsWithExtras(nextPage, true);
    setPage(nextPage);
  };

  // IntersectionObserver untuk infinite scroll
  useEffect(() => {
    if (!loaderRef.current) return;

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          loadMore();
        }
      },
      { threshold: 1.0 }
    );

    observerRef.current.observe(loaderRef.current);

    return () => observerRef.current && observerRef.current.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderRef.current, hasMore, loadingMore, page]);

  const handleCreatePost = async (e) => {
    e.preventDefault();
    setLoadingPost(true);
    setError('');
    try {
      const urls = [];
      for (const file of imageFiles) {
        const up = await uploadImage(file);
        urls.push(up.url);
      }

      await createPost(content, urls);
      setContent('');
      setImageFiles([]);

      // reload from first page supaya post baru muncul di atas
      await resetAndLoadFirstPage();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPost(false);
    }
  };

  const handleToggleLike = async (postId) => {
    try {
      const res = await toggleLike(postId);
      setLikes((prev) => {
        const current = prev[postId] || 0;
        const next = res.liked ? current + 1 : Math.max(0, current - 1);
        return { ...prev, [postId]: next };
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCommentChange = (postId, value) => {
    setCommentInput((prev) => ({ ...prev, [postId]: value }));
  };

  const handleAddComment = async (postId) => {
    const text = (commentInput[postId] || '').trim();
    if (!text) return;
    try {
      const newComment = await addComment(postId, text);
      setCommentsState((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] || []), newComment],
      }));
      setCommentInput((prev) => ({ ...prev, [postId]: '' }));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFilesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setImageFiles(files);
  };

  // Slider handlers
  const handleNextImage = (postId, length) => {
    setImageIndex((prev) => {
      const current = prev[postId] || 0;
      const next = (current + 1) % length;
      return { ...prev, [postId]: next };
    });
  };

  const handlePrevImage = (postId, length) => {
    setImageIndex((prev) => {
      const current = prev[postId] || 0;
      const next = (current - 1 + length) % length;
      return { ...prev, [postId]: next };
    });
  };

  /* ================= LOGIN UI ================= */

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100">
        <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
          <h1 className="text-2xl font-extrabold mb-2 text-slate-800 text-center">
            Socmed Microservice
          </h1>
          <p className="text-xs text-slate-500 text-center mb-6">
            Simple social app with microservice architecture
          </p>
          {error && (
            <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <form onSubmit={handleAuth} className="space-y-4">
            {mode === 'register' && (
              <>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Username"
                  name="username"
                  value={form.username}
                  onChange={handleChange}
                />
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                />
              </>
            )}
            {mode === 'login' && (
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                placeholder="Email atau Username"
                name="emailOrUsername"
                value={form.emailOrUsername}
                onChange={handleChange}
              />
            )}
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
              placeholder="Password"
              name="password"
              value={form.password}
              onChange={handleChange}
            />
            <button
              type="submit"
              className="w-full bg-slate-900 text-white py-2 rounded-lg hover:bg-slate-800 transition text-sm font-semibold"
            >
              {mode === 'login' ? 'Login' : 'Register'}
            </button>
          </form>
          <div className="mt-4 text-center text-xs text-slate-600">
            {mode === 'login' ? (
              <>
                Belum punya akun?{' '}
                <button className="text-blue-600" onClick={() => setMode('register')}>
                  Register
                </button>
              </>
            ) : (
              <>
                Sudah punya akun?{' '}
                <button className="text-blue-600" onClick={() => setMode('login')}>
                  Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ================= HOME UI ================= */

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white/80 backdrop-blur shadow-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Socmed Microservice</h1>
            <p className="text-xs text-slate-500">Simple feed with posts, likes & comments</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
              Hi, <span className="font-semibold">{user.username}</span>
            </span>
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-100"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg">
            {error}
          </div>
        )}

        {/* POST CREATOR */}
        <div className="bg-white rounded-2xl shadow-md p-4 sm:p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
              {user.username.charAt(0).toUpperCase()}
            </div>
            <form onSubmit={handleCreatePost} className="flex-1 space-y-3">
              <textarea
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 resize-none"
                rows={2}
                placeholder="Apa yang kamu pikirkan hari ini?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
              />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <label className="inline-flex items-center px-3 py-2 rounded-full border border-dashed border-slate-300 text-slate-600 cursor-pointer hover:bg-slate-50">
                    <span className="mr-2">📷</span>
                    <span>Pilih gambar (bisa lebih dari satu)</span>
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFilesChange}
                    />
                  </label>
                  {imageFiles.length > 0 && (
                    <span className="text-[11px] text-slate-500">
                      {imageFiles.length} file dipilih
                    </span>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={loadingPost}
                  className="self-end bg-slate-900 text-white px-5 py-2 rounded-full text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {loadingPost ? 'Posting...' : 'Post'}
                </button>
              </div>

              {imageFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                  {imageFiles.map((f, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-1 rounded-full bg-slate-100 border border-slate-200 truncate max-w-[160px]"
                      title={f.name}
                    >
                      {f.name}
                    </span>
                  ))}
                </div>
              )}
            </form>
          </div>
        </div>

        {/* FEED */}
        <section className="space-y-4">
          {posts.map((p) => {
            const imgs = p.images || [];
            const idx = imageIndex[p.id] || 0;
            const currentImg = imgs.length > 0 ? imgs[idx % imgs.length] : null;

            return (
              <article
                key={p.id}
                className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 space-y-3"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-200">
                    <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                      {p.user_name?.[0]?.toUpperCase()}
                    </div>
                </div>

                <div className="text-sm text-slate-800 whitespace-pre-wrap">
                  {p.content}
                </div>

                {/* IMAGE SLIDER */}
                {currentImg && (
                  <div className="mt-2 relative">
                    <div className="w-full h-64 bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center">
                      <img
                        src={`${API_URL}${currentImg.url}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {imgs.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => handlePrevImage(p.id, imgs.length)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center shadow"
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          onClick={() => handleNextImage(p.id, imgs.length)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/80 hover:bg-white text-slate-700 rounded-full w-8 h-8 flex items-center justify-center shadow"
                        >
                          ›
                        </button>

                        <div className="flex justify-center gap-1 mt-2">
                          {imgs.map((img, i) => (
                            <span
                              key={img.id}
                              className={
                                'w-2 h-2 rounded-full ' +
                                (i === idx ? 'bg-slate-800' : 'bg-slate-300')
                              }
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Like & Comments */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <div className="flex items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => handleToggleLike(p.id)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                    >
                      <span>👍</span>
                      <span>Like</span>
                    </button>
                    <span className="text-slate-500">
                      {likes[p.id] || 0} likes
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    {(comments[p.id] || []).map((c) => (
                      <div key={c.id} className="flex gap-2">
                       
                        <div className="flex-1 bg-slate-50 rounded-xl px-3 py-2">
                          <div className="font-semibold text-slate-700 text-[11px]">                            
                            #{c.username}
                          </div>
                          <div className="font-semibold text-slate-700 text-[11px]">
                            {c.email}
                          </div>
                          <div className="text-slate-700">{c.content}</div>
                        </div>
                      </div>
                    ))}

                    <div className="flex gap-2 mt-1">
                      <input
                        className="flex-1 border rounded-full px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-300"
                        placeholder="Tulis komentar..."
                        value={commentInput[p.id] || ''}
                        onChange={(e) => handleCommentChange(p.id, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => handleAddComment(p.id)}
                        className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-full hover:bg-slate-800"
                      >
                        Kirim
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}

          {/* LOADER untuk infinite scroll */}
          <div ref={loaderRef} className="py-4 flex justify-center">
            {loadingMore && (
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                <span>Loading...</span>
              </div>
            )}
            {!hasMore && posts.length > 0 && !loadingMore && (
              <div className="text-xs text-slate-400">Tidak ada postingan lagi.</div>
            )}
          </div>

          {posts.length === 0 && !loadingMore && (
            <div className="text-center text-slate-500 text-sm">
              Belum ada postingan.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
