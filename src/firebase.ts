import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC-QlZABpoOG8yrXz_rQELccxgvWZsBKFA",
  authDomain: "revenge-b80cd.firebaseapp.com",
  projectId: "revenge-b80cd",
  storageBucket: "revenge-b80cd.firebasestorage.app",
  messagingSenderId: "1033636381712",
  appId: "1:1033636381712:web:e8c4c729db1f4c4d54b695",
  measurementId: "G-0S9KFFEB1H"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
