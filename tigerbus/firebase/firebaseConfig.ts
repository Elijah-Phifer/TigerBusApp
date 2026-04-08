import { initializeApp } from 'firebase/app';
// @ts-ignore - exported from RN bundle at runtime
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyBCy8h25qOXh725ztXg5TpaqSTo9ezU6TQ",
  authDomain: "huzz-e347f.firebaseapp.com",
  projectId: "huzz-e347f",
  storageBucket: "huzz-e347f.firebasestorage.app",
  messagingSenderId: "478275774188",
  appId: "1:478275774188:web:f3fe72e47b7a38c53267c9",
  measurementId: "G-RZXHTC10C3"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});
export const db = getFirestore(app);
export const storage = getStorage(app);
