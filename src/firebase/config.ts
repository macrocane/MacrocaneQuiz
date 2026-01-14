// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
  projectId: "studio-5762279613-4541b",
  appId: "1:1006064055262:web:9863a3c01db7b755b3a34f",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "studio-5762279613-4541b.firebaseapp.com",
  messagingSenderId: "1006064055262",
  measurementId: "",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);