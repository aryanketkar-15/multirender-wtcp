import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    itp_support?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

/** Loads Google's script once, and only when the page asks for it (never on the consent page). */
function loadGoogleScript(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('Google sign-in did not initialise'));
    });
    script.addEventListener('error', () => reject(new Error('Google sign-in could not be loaded')));
  });
}

interface Props {
  /** Where to go after a successful sign-in. */
  redirectTo: string;
  /** "signin" or "signup" only changes the wording of the button. */
  mode: 'signin' | 'signup';
}

/**
 * "Continue with Google". Sign in and sign up are the same flow: the server creates the account the
 * first time and signs in afterwards. Renders nothing unless the server has Google configured, so a
 * deployment without a client id shows no dead button and loads nothing from Google.
 */
export function GoogleSignIn({ redirectTo, mode }: Props) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const holder = useRef<HTMLDivElement>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.get<{ google_client_id?: string | null }>('/api/auth/config').then((res) => {
      if (!cancelled && res.ok && typeof res.data.google_client_id === 'string') {
        setClientId(res.data.google_client_id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!clientId || !holder.current) return;
    let cancelled = false;
    loadGoogleScript()
      .then((google) => {
        if (cancelled || !holder.current) return;
        google.initialize({
          client_id: clientId,
          auto_select: false,
          cancel_on_tap_outside: true,
          itp_support: true,
          callback: async ({ credential }) => {
            setProblem(null);
            if (!credential) {
              setProblem('Google did not return a sign-in. Please try again.');
              return;
            }
            const outcome = await loginWithGoogle(credential);
            if (outcome.kind === 'ok') {
              navigate(redirectTo, { replace: true });
            } else if (outcome.kind === 'throttled') {
              setProblem('Too many attempts. Please wait a little and try again.');
            } else {
              setProblem('Google sign-in could not be verified. Please try again.');
            }
          },
        });
        google.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: 320,
        });
      })
      .catch(() => {
        if (!cancelled)
          setProblem('Google sign-in is unavailable right now. Use your email and password.');
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, loginWithGoogle, mode, navigate, redirectTo]);

  if (!clientId) return null;
  return (
    <div className="google-signin">
      <div ref={holder} className="google-signin-button" />
      {problem ? (
        <p className="field-error" role="alert">
          {problem}
        </p>
      ) : null}
      <p className="hint">
        Uses Google Identity Services: this page loads a script from Google. We receive your name
        and verified email address, nothing else.
      </p>
      <div className="auth-or" role="separator" aria-label="or">
        <span>or</span>
      </div>
    </div>
  );
}
