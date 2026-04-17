const admin = require('firebase-admin');

let initialized = false;

const initFirebase = () => {
  if (initialized) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });

  initialized = true;
  console.log('Firebase Admin initialized');
};

module.exports = { admin, initFirebase };