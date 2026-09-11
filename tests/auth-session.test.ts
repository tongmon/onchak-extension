import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
let data: Record<string, any> = {};
(globalThis as any).chrome = {
  storage: {
    local: {
      get: async (keys: string[] | string) =>
        Object.fromEntries(
          (typeof keys === "string" ? [keys] : keys).map((k) => [k, data[k]]),
        ),
      set: async (values: object) => {
        Object.assign(data, values);
      },
      remove: async (key: string) => {
        delete data[key];
      },
    },
  },
};
const { authenticatedFetch, validateStoredSession, SessionExpiredError } =
  await import("../src/entities/auth/api/session-client.ts");
const { scopedStorageKey, initializeLegacyScope } =
  await import("../src/shared/extension/storage/account-scope.ts");
const { login, MfaChallengeRequired, completeMfaLogin } =
  await import("../src/entities/auth/api/auth-client.ts");
const config = {
  mode: "remote" as const,
  apiBaseUrl: "http://localhost:8080",
  loginPath: "/api/auth/login",
  csrfPath: "/api/auth/csrf",
};
const session = {
  mode: "remote" as const,
  apiBaseUrl: config.apiBaseUrl,
  user: { email: "a@example.com", displayName: "A" },
  authenticatedAt: "2026-09-11T00:00:00Z",
  accessToken: "valid",
  csrfToken: "csrf",
  tokenType: "Bearer",
};
beforeEach(() => {
  data = { authConfig: config, authSession: { ...session } };
});

test("invalid and mixed-environment sessions are removed before a write", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({});
  };
  data.authSession = { ...session, apiBaseUrl: "https://zephlyglobal.com" };
  await assert.rejects(
    authenticatedFetch("/api/margin-results", { method: "POST" }),
    SessionExpiredError,
  );
  assert.equal(calls, 0);
  assert.equal(data.authSession, undefined);
});
test("me authenticated false expires a persisted session; a server failure retains it", async () => {
  globalThis.fetch = async () =>
    Response.json({ message: "database unavailable" }, { status: 503 });
  await assert.rejects(validateStoredSession(config, session));
  assert.equal(data.authSession.accessToken, "valid");
  globalThis.fetch = async () => Response.json({ authenticated: false });
  assert.equal(await validateStoredSession(config, session), null);
  assert.equal(data.authSession, undefined);
});
test("401 is never replayed, and an older failed request cannot delete a newer login", async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    data.authSession = { ...session, accessToken: "new" };
    return Response.json({}, { status: 401 });
  };
  await assert.rejects(
    authenticatedFetch("/api/margin-results", { method: "POST" }),
    SessionExpiredError,
  );
  assert.equal(calls, 1);
  assert.equal(data.authSession.accessToken, "new");
});
test("403 and malformed successful responses do not revoke the session", async () => {
  globalThis.fetch = async () => Response.json({}, { status: 403 });
  await assert.rejects(authenticatedFetch("/api/margin-results"), /권한/);
  assert.equal(data.authSession.accessToken, "valid");
  globalThis.fetch = async () => Response.json({});
  await assert.rejects(validateStoredSession(config, session), /응답 형식/);
  assert.equal(data.authSession.accessToken, "valid");
});
test("draft keys are scoped by account and origin; legacy data is claimed by its recorded owner once", async () => {
  data.draft = { cost: 18 };
  await initializeLegacyScope();
  const a = await scopedStorageKey("draft");
  assert.deepEqual(data[a], { cost: 18 });
  data.authSession = { ...session, user: { email: "b@example.com" } };
  const b = await scopedStorageKey("draft");
  assert.notEqual(a, b);
  assert.equal(data[b], undefined);
  data.authSession = { ...session };
  assert.equal(await scopedStorageKey("draft"), a);
});
test("MFA challenge is not a session and verification consumes the challenge token", async () => {
  const responses = [
    { token: "csrf" },
    {
      authStatus: "MFA_REQUIRED",
      accessToken: "",
      challengeToken: "challenge",
    },
  ];
  globalThis.fetch = async () => Response.json(responses.shift());
  let challenge: any;
  try {
    await login({ email: "a@example.com", password: "1111" }, config);
    assert.fail("challenge expected");
  } catch (e) {
    assert.ok(e instanceof MfaChallengeRequired);
    challenge = e.challenge;
  }
  globalThis.fetch = async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), {
      challengeToken: "challenge",
      code: "123456",
    });
    return Response.json({
      authStatus: "AUTHENTICATED",
      accessToken: "verified",
      recoveryCodes: [],
    });
  };
  assert.equal(
    (await completeMfaLogin(challenge, "123456")).session.accessToken,
    "verified",
  );
});
