import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Button,
  Code,
  Paper,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { authStorage, type AuthSession } from "@/entities/auth";
import {
  completeMfaLogin,
  prepareMfaEnrollment,
  type MfaChallenge,
} from "@/entities/auth";

export function MfaPanel({
  challenge,
  onCancel,
}: {
  challenge: MfaChallenge;
  onCancel: () => void;
}) {
  const [key, setKey] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState<{
    session: AuthSession;
    recoveryCodes: string[];
  } | null>(null);
  const preparation = useRef<{
    challenge: MfaChallenge;
    request: Promise<string>;
  } | null>(null);
  const enrollment = challenge.status === "MFA_ENROLLMENT_REQUIRED";
  useEffect(() => {
    if (!enrollment) return;
    let active = true;
    if (preparation.current?.challenge !== challenge) {
      preparation.current = {
        challenge,
        request: prepareMfaEnrollment(challenge),
      };
    }
    void preparation.current.request
      .then((value) => {
        if (active) setKey(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [challenge, enrollment]);
  const finish = async () => {
    setBusy(true);
    setError("");
    try {
      if (completed) {
        await authStorage.setSession(completed.session);
        return;
      }
      const result = await completeMfaLogin(challenge, code);
      if (result.recoveryCodes.length) setCompleted(result);
      else await authStorage.setSession(result.session);
    } catch (e) {
      setError(e instanceof Error ? e.message : "인증에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Paper p="md" withBorder>
      <Stack>
        <Text fw={700}>2단계 인증</Text>
        {error && <Alert color="red">{error}</Alert>}
        {completed ? (
          <>
            <Text>
              복구 코드를 안전한 곳에 저장해 주세요. 이 화면을 닫으면 다시
              표시되지 않습니다.
            </Text>
            <Code block>{completed.recoveryCodes.join("\n")}</Code>
            <Button loading={busy} onClick={() => void finish()}>
              복구 코드를 저장했습니다
            </Button>
          </>
        ) : (
          <>
            {enrollment && (
              <>
                <Text>
                  인증 앱에 아래 키를 등록한 뒤 6자리 코드를 입력해 주세요.
                </Text>
                <Code>{key || "등록 키 불러오는 중"}</Code>
              </>
            )}
            <TextInput
              label="인증 코드"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
            />
            <Button
              loading={busy}
              disabled={!code.trim() || (enrollment && !key)}
              onClick={() => void finish()}
            >
              인증 확인
            </Button>
            <Button variant="subtle" onClick={onCancel}>
              다시 로그인
            </Button>
          </>
        )}
      </Stack>
    </Paper>
  );
}
