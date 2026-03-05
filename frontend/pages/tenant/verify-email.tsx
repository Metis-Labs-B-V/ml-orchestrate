import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  resendVerification,
  resetState,
  verifyEmail,
} from '../../store/slices/verifyEmailSlice';

export default function VerifyEmail() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const dispatch = useAppDispatch();
  const { status, message, email, resendLoading, resendSuccess } = useAppSelector(
    (state) => state.verifyEmail
  );

  useEffect(() => {
    if (!token) return;
    dispatch(verifyEmail({ token: String(token) }))
      .unwrap()
      .then((result) => {
        if (result?.shouldRedirect) {
          router.replace('/dashboard/scenarios');
        }
      })
      .catch(() => null);
  }, [dispatch, router, token]);

  useEffect(() => {
    return () => {
      dispatch(resetState());
    };
  }, [dispatch]);

  const handleResend = async () => {
    dispatch(resendVerification({ email }));
  };

  if (status === 'loading') {
    return (
      <section className="verify-email-shell" role="status" aria-live="polite" aria-label="Verifying email">
        <div className="verify-email-card verify-email-card--loading" aria-hidden="true">
          <div className="ui-shimmer-line ui-shimmer-line--lg" />
          <div className="ui-shimmer-line ui-shimmer-line--md" />
          <div className="ui-shimmer-line ui-shimmer-line--sm" />
        </div>
      </section>
    );
  }
  if (status === 'success') return <div>{message}</div>;
  if (status === 'invalid') return <div>{message}</div>;
  if (status === 'expired') return (
    <div>
      <div>{message}</div>
      <button onClick={handleResend} disabled={resendLoading || resendSuccess}>
        {resendLoading ? 'Resending...' : resendSuccess ? 'Link Sent!' : 'Resend Link'}
      </button>
    </div>
  );
  return null;
}
