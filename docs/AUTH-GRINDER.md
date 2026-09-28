# Grinder authentication — closed test

## Current phase

The closed-test release exposes only **Google sign-in**.

- Google: enabled
- STACK ID: disabled until post-test rollout
- WhatsApp: disabled until post-test rollout
- Biometrics: disabled until post-test rollout

The provider list lives in `config/auth.json`. The login screen does not need to be rebuilt to re-enable future providers.

## One external value still required

Create an OAuth 2.0 **Web application** client in Google Cloud for the project used by the app and place its public client ID in:

`config/auth.json -> providers.google.client_id`

For the current GitHub Pages preview, add this JavaScript origin to the Google OAuth client:

`https://skyarecom.github.io`

When the production domain is used, add that origin too.

Never put a Google client secret in this repository or in browser code.

## Closed-test verification mode

During the closed test, `verification_mode` is `client_only_closed_test`.

That mode is intentionally limited:
- Google supplies the signed credential to the browser.
- The app stores only a local identity snapshot.
- The Google credential itself is not persisted.
- Paid plans, entitlements, billing, or sensitive server actions must not trust this local snapshot.

## Production mode

Before enabling paid entitlements or server-side account data:

1. Set `verification_mode` to `backend_exchange`.
2. Configure `STACKUP_CONFIG.apiBase`.
3. Implement `POST /v1/auth/google` on the backend.
4. Verify the Google ID token signature, issuer, audience, and expiry on the server.
5. Map the Google subject to the canonical StackUp identity.
6. Return the app session token and StackUp ID.

This keeps Google as an external authentication provider while STACK ID remains the canonical account identity.

## Post-test provider rollout

After the closed-test phase, providers can be enabled independently in `config/auth.json`:

- `stackup_id.enabled`
- `whatsapp.enabled`
- `biometrics.enabled`

Each provider should have its own adapter and should create or link to the same canonical StackUp identity rather than creating separate product accounts.

## Play review

If Play review cannot access the app without authentication, keep the Play Console **App access** instructions current and provide a review path that works repeatedly.
