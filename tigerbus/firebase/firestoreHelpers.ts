import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  serverTimestamp,
  Timestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebaseConfig';

// ─── USER CHIPS ──────────────────────────────────────

export const getUserChips = async (uid: string): Promise<string[] | null> => {
  const snap = await getDoc(doc(db, 'userChips', uid));
  if (!snap.exists()) return null;
  return snap.data().chips as string[];
};

export const saveUserChips = async (uid: string, chips: string[]) => {
  await setDoc(doc(db, 'userChips', uid), { chips });
};

// ─── PLACES ───────────────────────────────────────────

export const addPlace = async (placeData: {
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  picture?: string;
  costLevel: 'free' | 'low' | 'medium' | 'high';
  createdBy: string;
}) => {
  return await addDoc(collection(db, 'places'), {
    ...placeData,
    createdAt: serverTimestamp()
  });
};

export const getPlaces = async () => {
  const snapshot = await getDocs(collection(db, 'places'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ─── REVIEWS ──────────────────────────────────────────

export const addReview = async (placeId: string, reviewData: {
  userId: string;
  vibeScore: number;
  vibeEmoji: string;
  description: string;
  picture?: string;
}) => {
  return await addDoc(collection(db, 'places', placeId, 'reviews'), {
    ...reviewData,
    createdAt: serverTimestamp()
  });
};

export const getReviews = async (placeId: string) => {
  const snapshot = await getDocs(collection(db, 'places', placeId, 'reviews'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ─── CLIP AI ─────────────────────────────────────────
// Replace with your teammate's Clip AI server IP
export const CLIP_AI_URL = 'http://PLACEHOLDER_IP:5000';

// ─── POSTS (Meetups & Shared Locations) ──────────────

export const createPost = async (postData: {
  type: 'meetup' | 'share';
  createdBy: string;
  createdByName: string;
  title: string;
  description: string;
  images: string[];
  latitude: number;
  longitude: number;
  tags: string[];
  pinColor: string;
}) => {
  return await addDoc(collection(db, 'posts'), {
    ...postData,
    createdAt: serverTimestamp(),
  });
};

export const getPosts = async () => {
  const snapshot = await getDocs(collection(db, 'posts'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const onPostsSnapshot = (
  callback: (posts: any[]) => void
) => {
  return onSnapshot(collection(db, 'posts'), (snapshot) => {
    const posts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(posts);
  });
};

export const deletePost = async (postId: string) => {
  await deleteDoc(doc(db, 'posts', postId));
};

/** Check if a post still exists */
export const postExists = async (postId: string): Promise<boolean> => {
  const snap = await getDoc(doc(db, 'posts', postId));
  return snap.exists();
};

export const updatePost = async (postId: string, data: Partial<{
  title: string;
  description: string;
  images: string[];
  tags: string[];
  pinColor: string;
}>) => {
  await setDoc(doc(db, 'posts', postId), data, { merge: true });
};

export const getPostsByType = async (type: 'meetup' | 'share') => {
  const q = query(collection(db, 'posts'), where('type', '==', type));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// Legacy meetup helpers (kept for compatibility)
export const createMeetup = async (meetupData: {
  placeId: string;
  createdBy: string;
  title: string;
  description: string;
  meetupTime: string;
}) => {
  return await addDoc(collection(db, 'meetups'), {
    ...meetupData,
    createdAt: serverTimestamp()
  });
};

export const getMeetups = async () => {
  const snapshot = await getDocs(collection(db, 'meetups'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getMeetupsByPlace = async (placeId: string) => {
  const q = query(collection(db, 'meetups'), where('placeId', '==', placeId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ─── MEETUP RESPONSES ─────────────────────────────────

export const respondToMeetup = async (meetupId: string, responseData: {
  userId: string;
  status: 'going' | 'maybe' | 'not_going';
}) => {
  return await addDoc(collection(db, 'meetups', meetupId, 'responses'), {
    ...responseData,
    respondedAt: serverTimestamp()
  });
};

export const getMeetupResponses = async (meetupId: string) => {
  const snapshot = await getDocs(collection(db, 'meetups', meetupId, 'responses'));
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

// ─── USER DOCUMENTS ───────────────────────────────────

export const createUserDoc = async (uid: string, data: { username: string; email: string }) => {
  await setDoc(doc(db, 'users', uid), {
    ...data,
    createdAt: serverTimestamp(),
  });
};

export const getUserDoc = async (uid: string) => {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

// ─── CHECK-INS ────────────────────────────────────────

export const addCheckin = async (data: {
  userId: string;
  placeId: string;
  placeName: string;
  method: string;
}) => {
  return await addDoc(collection(db, 'checkins'), {
    ...data,
    checkedInAt: serverTimestamp(),
  });
};

export const getCheckinsByUser = async (userId: string) => {
  const q = query(collection(db, 'checkins'), where('userId', '==', userId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

export const getTodayCheckin = async (userId: string, placeId: string) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startTs = Timestamp.fromDate(startOfDay);

  const q = query(
    collection(db, 'checkins'),
    where('userId', '==', userId),
    where('placeId', '==', placeId),
    where('checkedInAt', '>=', startTs)
  );
  const snapshot = await getDocs(q);
  return !snapshot.empty;
};

export const addCheckinWithDate = async (data: {
  userId: string;
  placeId: string;
  placeName: string;
  method: string;
  checkedInAt: Date;
  enjoyed?: boolean | null;
  notEnjoyedReason?: string | null;
}) => {
  const { checkedInAt, ...rest } = data;
  return await addDoc(collection(db, 'checkins'), {
    ...rest,
    checkedInAt: Timestamp.fromDate(checkedInAt),
  });
};

export const updateCheckinFeedback = async (
  checkinId: string,
  enjoyed: boolean,
  notEnjoyedReason?: 'place' | 'skip' | null,
) => {
  const ref = doc(db, 'checkins', checkinId);
  await updateDoc(ref, {
    enjoyed,
    notEnjoyedReason: enjoyed ? null : (notEnjoyedReason || null),
  });
};

// ─── REACTIONS ────────────────────────────────────────

type Reaction = {
  id: string;
  userId: string;
  emoji: string;
  createdAt?: Timestamp;
};

export const getReactions = async (placeId: string): Promise<Reaction[]> => {
  const snapshot = await getDocs(collection(db, 'places', placeId, 'reactions'));
  return snapshot.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<Reaction, 'id'>),
  }));
};

export const addReaction = async (placeId: string, data: { userId: string; emoji: string }) => {
  // Upsert: one reaction per user per place
  const ref = doc(db, 'places', placeId, 'reactions', data.userId);
  await setDoc(ref, { ...data, createdAt: serverTimestamp() });
};

export const deleteReaction = async (placeId: string, userId: string) => {
  await deleteDoc(doc(db, 'places', placeId, 'reactions', userId));
};

// ─── SAVED PLACES ─────────────────────────────────────

export const savePlace = async (userId: string, placeId: string, placeName?: string, latitude?: number, longitude?: number) => {
  const ref = doc(db, 'users', userId, 'savedPlaces', placeId);
  await setDoc(ref, {
    placeId,
    placeName: placeName || '',
    latitude: latitude || 0,
    longitude: longitude || 0,
    savedAt: serverTimestamp(),
  });
};

export const unsavePlace = async (userId: string, placeId: string) => {
  await deleteDoc(doc(db, 'users', userId, 'savedPlaces', placeId));
};

export const getSavedPlaces = async (userId: string) => {
  const snapshot = await getDocs(collection(db, 'users', userId, 'savedPlaces'));
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
};

// ─── PLACE OF THE DAY ─────────────────────────────────

export const getPlaceOfTheDay = async () => {
  const places = await getPlaces();
  if (places.length === 0) return null;

  // Deterministic pick based on today's date
  const today = new Date();
  const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const index = seed % places.length;
  const place = places[index] as any;

  // Get top emoji for this place
  let topEmoji = '📍';
  let reactionCount = 0;
  try {
    const reactions = await getReactions(place.id);
    reactionCount = reactions.length;
    if (reactions.length > 0) {
      const counts: Record<string, number> = {};
      reactions.forEach((r: any) => {
        counts[r.emoji] = (counts[r.emoji] || 0) + 1;
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      topEmoji = top[0];
    }
  } catch {}

  return { place, topEmoji, reactionCount };
};
