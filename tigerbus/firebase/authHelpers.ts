import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  User
} from 'firebase/auth';
import { doc, setDoc, getDocs, query, where, collection } from 'firebase/firestore';
import { auth, db } from './firebaseConfig';
import { createUserDoc } from './firestoreHelpers';

export const signUp = async (email: string, password: string, username: string): Promise<User> => {
  // Check if username is already taken
  const q = query(collection(db, 'usernames'), where('username', '==', username.toLowerCase()));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    throw new Error('Username is already taken.');
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(userCredential.user, { displayName: username });

  // Store username → email mapping
  await setDoc(doc(db, 'usernames', userCredential.user.uid), {
    username: username.toLowerCase(),
    email: email.toLowerCase(),
  });

  // Create user profile document
  await createUserDoc(userCredential.user.uid, {
    username: username,
    email: email.toLowerCase(),
  });

  return userCredential.user;
};

export const logIn = async (username: string, password: string): Promise<User> => {
  // Look up email by username
  const q = query(collection(db, 'usernames'), where('username', '==', username.toLowerCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('Username not found.');
  }

  const email = snapshot.docs[0].data().email;
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
};

export const resetPassword = async (username: string): Promise<void> => {
  // Look up email by username
  const q = query(collection(db, 'usernames'), where('username', '==', username.toLowerCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error('Username not found.');
  }

  const email = snapshot.docs[0].data().email;
  await sendPasswordResetEmail(auth, email);
};

export const logOut = async (): Promise<void> => {
  await signOut(auth);
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};
