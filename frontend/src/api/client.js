const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

let accessToken = null;
let refreshToken = null;

const STORAGE_KEY = 'socmed_auth';

export function setTokens(at, rt) {
  accessToken = at;
  refreshToken = rt;
}

export function saveAuthToStorage({ accessToken, refreshToken, user }) {
  setTokens(accessToken, refreshToken);
  if (typeof window !== 'undefined') {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ accessToken, refreshToken, user })
    );
  }
}

export function loadAuthFromStorage() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    setTokens(data.accessToken, data.refreshToken);
    return data;
  } catch {
    return null;
  }
}

export function clearAuth() {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export async function request(path, options = {}) {
  const headers = {
    ...(options.headers || {})
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  if (res.status === 401 && refreshToken) {
    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    if (refreshRes.ok) {
      const data = await refreshRes.json();
      accessToken = data.accessToken;
      headers['Authorization'] = `Bearer ${accessToken}`;
      return fetch(`${API_URL}${path}`, { ...options, headers });
    }
  }

  return res;
}

export async function login(emailOrUsername, password) {
  const res = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ emailOrUsername, password })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Login failed');
  }
  const data = await res.json();
  saveAuthToStorage({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: data.user
  });
  return data;
}

export async function register(username, email, password) {
  const res = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, email, password })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Register failed');
  }
  return res.json();
}

export async function getPosts(page = 1, limit = 5) {
  const res = await request(`/posts?page=${page}&limit=${limit}`);
  if (!res.ok) throw new Error('Failed to load posts');
  return res.json();
}

export async function createPost(content, imageUrls = []) {
  const res = await request('/posts', {
    method: 'POST',
    body: JSON.stringify({
      content,
      image_urls: imageUrls,   // <== kirim array
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create post');
  }
  return res.json();
}

export async function uploadImage(file) {
  const formData = new FormData();
  formData.append('file', file);

  const headers = {};
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await request('/media/upload', {
    method: 'POST',
    body: formData,
    headers
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload image');
  }
  return res.json();
}

/** LIKE & COMMENT API **/

export async function toggleLike(postId) {
  const res = await request('/likes/toggle', {
    method: 'POST',
    body: JSON.stringify({ post_id: postId })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to toggle like');
  }
  return res.json(); // { liked: true/false }
}

export async function getLikeCount(postId) {
  const res = await request(`/likes/count?post_id=${postId}`);
  if (!res.ok) throw new Error('Failed to get like count');
  return res.json(); // { post_id, count }
}

export async function getComments(postId) {
  const res = await request(`/comments?post_id=${postId}`);
  if (!res.ok) throw new Error('Failed to get comments');
  return res.json(); // array comments
}

export async function addComment(postId, content) {
  const res = await request('/comments', {
    method: 'POST',
    body: JSON.stringify({ post_id: postId, content })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to add comment');
  }
  return res.json(); // comment baru
}
