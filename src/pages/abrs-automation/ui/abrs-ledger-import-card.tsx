import { useMemo, useRef, useState, type DragEvent, type ReactElement } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconCloudDownload,
  IconExternalLink,
  IconRefresh,
  IconTrash,
  IconUpload,
} from '@tabler/icons-react';
import {
  classifyAbrsLedgerFile,
  upsertAbrsLedgerFiles,
  validateAbrsLedgerFiles,
  type AbrsLedgerFileEntry,
  type AbrsLedgerFileSlot,
} from '../model/abrs-ledger-files';
import { downloadAbrsCoupangLedgerFileFromActiveTab } from '../api/download-abrs-coupang-ledger-file';
import { useUploadAbrsLedgerImportMutation } from '../api/upload-abrs-ledger-import-mutation';

interface UploadFeedback {
  color: 'green' | 'red' | 'yellow';
  title: string;
  message: string;
}

const SLOT_ROWS: Array<{
  slot: AbrsLedgerFileSlot;
  label: string;
}> = [
  { slot: 'inventoryHealth', label: '재고 현황' },
  { slot: 'salesStatistics', label: '판매 현황' },
  { slot: 'dailySettlement', label: '광고비/정산' },
];

const AUTO_DOWNLOADABLE_SLOTS = new Set<AbrsLedgerFileSlot>([
  'inventoryHealth',
  'salesStatistics',
  'dailySettlement',
]);

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getDefaultTargetDate(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return formatDateInputValue(yesterday);
}

function getFileNames(files: File[]): string {
  return files.map((file) => file.name).join(', ');
}

function createUnsupportedFileMessage(files: File[]): string | null {
  const unsupportedFiles = files.filter(
    (file) => classifyAbrsLedgerFile(file.name) === null,
  );

  if (unsupportedFiles.length === 0) {
    return null;
  }

  return `지원하지 않는 파일은 제외했습니다: ${getFileNames(unsupportedFiles)}`;
}

export function AbrsLedgerImportCard(): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [targetDate, setTargetDate] = useState(getDefaultTargetDate);
  const [entries, setEntries] = useState<AbrsLedgerFileEntry[]>([]);
  const [feedback, setFeedback] = useState<UploadFeedback | null>(null);
  const [downloadingSlot, setDownloadingSlot] =
    useState<AbrsLedgerFileSlot | null>(null);
  const uploadMutation = useUploadAbrsLedgerImportMutation();
  const validation = useMemo(
    () => validateAbrsLedgerFiles(entries, targetDate),
    [entries, targetDate],
  );
  const entriesBySlot = useMemo(
    () =>
      new Map<AbrsLedgerFileSlot, AbrsLedgerFileEntry>(
        entries.map((entry) => [entry.slot, entry]),
      ),
    [entries],
  );

  const handleFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setEntries((currentEntries) =>
      upsertAbrsLedgerFiles(currentEntries, files, targetDate),
    );

    const unsupportedMessage = createUnsupportedFileMessage(files);
    setFeedback(
      unsupportedMessage
        ? {
            color: 'yellow',
            title: '파일 확인',
            message: unsupportedMessage,
          }
        : null,
    );
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    handleFiles(Array.from(event.dataTransfer.files));
  };

  const handleUpload = async () => {
    setFeedback(null);

    try {
      const result = await uploadMutation.mutateAsync({
        targetDate,
        entries,
      });

      setFeedback({
        color: 'green',
        title: '업로드 완료',
        message: `${result.batchName} 장부 데이터를 서버에 업로드했습니다.`,
      });
    } catch (error) {
      setFeedback({
        color: 'red',
        title: '업로드 실패',
        message:
          error instanceof Error
            ? error.message
            : '장부 데이터를 업로드하지 못했습니다.',
      });
    }
  };

  const handleDownloadFromCoupang = async (slot: AbrsLedgerFileSlot) => {
    setFeedback(null);
    setDownloadingSlot(slot);

    try {
      const file = await downloadAbrsCoupangLedgerFileFromActiveTab({
        slot,
        targetDate,
      });

      if (!classifyAbrsLedgerFile(file.name)) {
        throw new Error(`지원하지 않는 파일명입니다: ${file.name}`);
      }

      setEntries((currentEntries) =>
        upsertAbrsLedgerFiles(currentEntries, [file], targetDate),
      );
      setFeedback({
        color: 'green',
        title: '파일 가져오기 완료',
        message: `${file.name} 파일을 추가했습니다.`,
      });
    } catch (error) {
      setFeedback({
        color: 'red',
        title: '파일 가져오기 실패',
        message:
          error instanceof Error
            ? error.message
            : 'Coupang Wing 파일을 가져오지 못했습니다.',
      });
    } finally {
      setDownloadingSlot(null);
    }
  };

  return (
    <Paper mt="md" p="lg" radius="xl" shadow="sm" withBorder>
      <Stack gap="md">
        <Group align="flex-start" justify="space-between">
          <Stack gap={2}>
            <Title fw={600} order={5}>
              ABRS 장부 업로드
            </Title>
            <Text c="dimmed" size="xs">
              Coupang Wing/광고센터 엑셀 파일
            </Text>
          </Stack>
          <Badge color={validation.ok ? 'teal' : 'gray'} radius="xl" variant="light">
            {validation.ok ? 'Ready' : `${entries.length}/3`}
          </Badge>
        </Group>

        <TextInput
          label="장부 날짜"
          max={formatDateInputValue(new Date())}
          onChange={(event) => {
            setTargetDate(event.currentTarget.value);
            setFeedback(null);
          }}
          radius="md"
          type="date"
          value={targetDate}
        />

        <Paper
          onDragOver={(event) => {
            event.preventDefault();
          }}
          onDrop={handleDrop}
          p="md"
          radius="md"
          withBorder
        >
          <Stack gap="sm">
            {SLOT_ROWS.map((row) => {
              const entry = entriesBySlot.get(row.slot);

              return (
                <Group key={row.slot} gap="xs" justify="space-between" wrap="nowrap">
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text fw={600} size="sm">
                      {row.label}
                    </Text>
                    <Text c={entry ? undefined : 'dimmed'} lineClamp={1} size="xs">
                      {entry?.file.name ?? '파일 없음'}
                    </Text>
                  </Stack>
                  <Group gap="xs" wrap="nowrap">
                    {AUTO_DOWNLOADABLE_SLOTS.has(row.slot) ? (
                      <Button
                        aria-label={`${row.label} Wing 파일 가져오기`}
                        disabled={downloadingSlot !== null}
                        loading={downloadingSlot === row.slot}
                        onClick={() => {
                          void handleDownloadFromCoupang(row.slot);
                        }}
                        radius="md"
                        size="compact-xs"
                        variant="light"
                      >
                        <IconCloudDownload size={14} />
                      </Button>
                    ) : null}
                    <Badge color={entry ? 'teal' : 'gray'} radius="xl" variant="light">
                      {entry ? 'OK' : 'Need'}
                    </Badge>
                  </Group>
                </Group>
              );
            })}
          </Stack>
        </Paper>

        {validation.ok ? null : (
          <Alert color="yellow" radius="lg" title="확인 필요">
            {validation.messages.slice(0, 3).join('\n')}
          </Alert>
        )}

        {feedback ? (
          <Alert color={feedback.color} radius="lg" title={feedback.title}>
            {feedback.message}
          </Alert>
        ) : null}

        <input
          ref={inputRef}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          multiple
          onChange={(event) => {
            handleFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = '';
          }}
          type="file"
        />

        <Group grow gap="xs">
          <Button
            leftSection={<IconUpload size={16} />}
            onClick={() => inputRef.current?.click()}
            radius="md"
            variant="default"
          >
            파일 추가
          </Button>
          <Button
            disabled={entries.length === 0 || uploadMutation.isPending}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              setEntries([]);
              setFeedback(null);
            }}
            radius="md"
            variant="default"
          >
            비우기
          </Button>
        </Group>

        <Button
          disabled={!validation.ok}
          leftSection={<IconRefresh size={16} />}
          loading={uploadMutation.isPending}
          onClick={() => {
            void handleUpload();
          }}
          radius="md"
        >
          서버 업로드
        </Button>

        <Group grow gap="xs">
          <Button
            component="a"
            href="https://wing.coupang.com"
            leftSection={<IconExternalLink size={16} />}
            radius="md"
            rel="noreferrer"
            target="_blank"
            variant="subtle"
          >
            Wing
          </Button>
          <Button
            component="a"
            href="https://advertising.coupang.com"
            leftSection={<IconExternalLink size={16} />}
            radius="md"
            rel="noreferrer"
            target="_blank"
            variant="subtle"
          >
            광고센터
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
