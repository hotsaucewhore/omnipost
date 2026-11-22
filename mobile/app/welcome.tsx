import { useRouter } from 'expo-router';
import React from 'react';
import { LandingPage } from '../components/LandingPage';
import { useOmniPost } from '../context/OmniPostContext';

export default function WelcomeRoute() {
  const router = useRouter();
  const { setRequestedAuthMode } = useOmniPost();

  return (
    <LandingPage
      onOpenAuth={(mode) => {
        setRequestedAuthMode(mode);
        router.push('/');
      }}
    />
  );
}
