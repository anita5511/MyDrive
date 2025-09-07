// swarupdrive/src/pages/DriveRedirect.tsx
import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const DriveRedirect: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { setUser } = useAuth(); // assume you’ve exposed a setter

  useEffect(() => {
    const userId = params.get('userId');
    if (!userId) {
      return navigate('/login');
    }

    // 👉 Directly set the user in context
    setUser({ id: userId, /* you can fetch and fill name/email too */ });
    // then push to dashboard
    navigate('/dashboard');
  }, [params, navigate, setUser]);

  return <div>Redirecting you into SwarupDrive…</div>;
};

export default DriveRedirect;
