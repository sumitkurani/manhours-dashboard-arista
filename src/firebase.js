import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDsID5-_Kj4cJqWqM28tcdOn03AA2MjHWE",
  authDomain: "manhours-dashboard.firebaseapp.com",
  projectId: "manhours-dashboard",
  storageBucket: "manhours-dashboard.firebasestorage.app",
  messagingSenderId: "45856909158",
  appId: "1:45856909158:web:0a0e8e0c5e16e3e6ef4aa7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();