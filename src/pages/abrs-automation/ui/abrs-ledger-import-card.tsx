import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from 'react';
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
  validateAbrsLedgerFiles,
  type AbrsLedgerFileEntry,
  type AbrsLedgerFileSlot,
} from '../model/abrs-ledger-files';
import {
  persistAbrsLedgerFiles,
  restoreAbrsLedgerEntries,
} from '../model/abrs-ledger-batch-cache';
import {
  clearAbrsLedgerBatch,
  downloadAllAbrsLedgerFiles,
  getAbrsLedgerBatch,
  getAbrsLedgerSelectedTargetDate,
  saveAbrsLedgerBatchFiles,
  saveAbrsLedgerSelectedTargetDate,
  type DownloadAllAbrsLedgerFilesResult,
} from '../api/abrs-ledger-batch-runtime';
import { downloadAbrsCoupangLedgerFileFromActiveTab } from '../api/download-abrs-coupang-ledger-file';
import { useUploadAbrsLedgerImportMutation } from '../api/upload-abrs-ledger-import-mutation';
import type { AbrsCoupangLedgerDownloadSlot } from '@/shared/extension';

interface UploadFeedback {
  color: 'green' | 'red' | 'yellow';
  title: string;
  message: string;
  suppressValidation?: boolean;
}

const SLOT_ROWS: Array<{
  slot: AbrsLedgerFileSlot;
  label: string;
  required: boolean;
}> = [
  { slot: 'inventoryHealth', label: '재고 현황', required: true },
  { slot: 'salesStatistics', label: '판매 현황', required: true },
  { slot: 'dailySettlement', label: '광고비/정산', required: true },
  { slot: 'productList', label: '상품 리스트', required: false },
];

const AUTO_DOWNLOADABLE_SLOTS = new Set<AbrsCoupangLedgerDownloadSlot>([
  'inventoryHealth',
  'salesStatistics',
  'dailySettlement',
]);

function isAutoDownloadableSlot(
  slot: AbrsLedgerFileSlot,
): slot is AbrsCoupangLedgerDownloadSlot {
  return AUTO_DOWNLOADABLE_SLOTS.has(slot as AbrsCoupangLedgerDownloadSlot);
}

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

function createDownloadAllFeedback(
  result: DownloadAllAbrsLedgerFilesResult,
): UploadFeedback {
  const downloaded = result.statuses.filter(
    (status) => status.status === 'downloaded',
  );
  const failed = result.statuses.filter((status) => status.status === 'failed');

  if (failed.length === 0) {
    return {
      color: 'green',
      title: '파일 가져오기 완료',
      message: `${downloaded.length}개 장부 파일을 가져와 cache에 저장했습니다.`,
    };
  }

  if (downloaded.length > 0) {
    return {
      color: 'yellow',
      title: '일부 파일 가져오기 완료',
      message: [
        `${downloaded.length}개 파일은 저장했습니다.`,
        ...failed.map((status) => `${status.slot}: ${status.error}`),
      ].join('\n'),
    };
  }

  return {
    color: 'red',
    title: '파일 가져오기 실패',
    message: failed.map((status) => `${status.slot}: ${status.error}`).join('\n'),
  };
}

export function AbrsLedgerImportCard(): ReactElement {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [targetDate, setTargetDate] = useState(getDefaultTargetDate);
  const [targetDateReady, setTargetDateReady] = useState(false);
  const [entries, setEntries] = useState<AbrsLedgerFileEntry[]>([]);
  const [feedback, setFeedback] = useState<UploadFeedback | null>(null);
  const [downloadingSlot, setDownloadingSlot] =
    useState<AbrsLedgerFileSlot | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
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
  const shouldShowValidation = !validation.ok && !feedback?.suppressValidation;
  const requiredEntryCount = SLOT_ROWS.filter(
    (row) => row.required && entriesBySlot.has(row.slot),
  ).length;

  useEffect(() => {
    let active = true;
    const fallbackDate = getDefaultTargetDate();

    void getAbrsLedgerSelectedTargetDate(fallbackDate)
      .then((result) => {
        if (!active) {
          return;
        }

        setTargetDate(result.targetDate);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setTargetDate(fallbackDate);
      })
      .finally(() => {
        if (active) {
          setTargetDateReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!targetDateReady) {
      return () => {
        active = false;
      };
    }

    setLoadingBatch(true);
    void getAbrsLedgerBatch(targetDate)
      .then((batch) => {
        if (!active) {
          return;
        }

        setEntries(restoreAbrsLedgerEntries(batch.entries));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setEntries([]);
        setFeedback({
          color: 'red',
          title: 'Cache 불러오기 실패',
          message:
            error instanceof Error
              ? error.message
              : '저장된 장부 파일 cache를 불러오지 못했습니다.',
        });
      })
      .finally(() => {
        if (active) {
          setLoadingBatch(false);
        }
      });

    return () => {
      active = false;
    };
  }, [targetDate, targetDateReady]);

  const handleTargetDateChange = (nextTargetDate: string) => {
    setTargetDate(nextTargetDate);
    setFeedback(null);

    void saveAbrsLedgerSelectedTargetDate(nextTargetDate).catch((error) => {
      setFeedback({
        color: 'yellow',
        title: '날짜 cache 저장 실패',
        message:
          error instanceof Error
            ? error.message
            : '선택한 장부 날짜를 cache에 저장하지 못했습니다.',
      });
    });
  };

  const handleFiles = async (files: File[]): Promise<boolean> => {
    if (files.length === 0) {
      return true;
    }

    const unsupportedMessage = createUnsupportedFileMessage(files);
    setFeedback(null);

    try {
      const currentBatch = await getAbrsLedgerBatch(targetDate);
      const persistedEntries = await persistAbrsLedgerFiles({
        existingEntries: currentBatch.entries,
        files,
        targetDate,
      });
      const nextBatch = await saveAbrsLedgerBatchFiles({
        targetDate,
        entries: persistedEntries,
      });

      setEntries(restoreAbrsLedgerEntries(nextBatch.entries));
      setFeedback(
        unsupportedMessage
          ? {
              color: 'yellow',
              title: '파일 확인',
              message: unsupportedMessage,
            }
          : null,
      );
      return true;
    } catch (error) {
      setFeedback({
        color: 'red',
        title: '파일 저장 실패',
        message:
          error instanceof Error
            ? error.message
            : '장부 파일 cache를 저장하지 못했습니다.',
      });
      return false;
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  const handleUpload = async () => {
    setFeedback(null);

    try {
      const result = await uploadMutation.mutateAsync({
        targetDate,
        entries,
      });

      await clearAbrsLedgerBatch(targetDate).catch(() => undefined);
      setEntries([]);
      setFeedback({
        color: 'green',
        title: '업로드 완료',
        message: `${result.batchName} 장부 데이터를 서버에 업로드했습니다.`,
        suppressValidation: true,
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

  const handleDownloadFromCoupang = async (
    slot: AbrsCoupangLedgerDownloadSlot,
  ) => {
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

      const saved = await handleFiles([file]);

      if (!saved) {
        return;
      }

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

  const handleDownloadAllFromCoupang = async () => {
    setFeedback(null);
    setDownloadingAll(true);

    try {
      const result = await downloadAllAbrsLedgerFiles(targetDate);

      setEntries(restoreAbrsLedgerEntries(result.batch.entries));
      setFeedback(createDownloadAllFeedback(result));
    } catch (error) {
      setFeedback({
        color: 'red',
        title: '파일 가져오기 실패',
        message:
          error instanceof Error
            ? error.message
            : 'Coupang 장부 파일을 가져오지 못했습니다.',
      });
    } finally {
      setDownloadingAll(false);
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
            {loadingBatch ? 'Loading' : validation.ok ? 'Ready' : `${requiredEntryCount}/3 필수`}
          </Badge>
        </Group>

        <TextInput
          label="장부 날짜"
          max={formatDateInputValue(new Date())}
          onChange={(event) => {
            handleTargetDateChange(event.currentTarget.value);
          }}
          radius="md"
          type="date"
          value={targetDate}
        />

        <Button
          disabled={loadingBatch || downloadingSlot !== null}
          leftSection={<IconCloudDownload size={16} />}
          loading={downloadingAll}
          onClick={() => {
            void handleDownloadAllFromCoupang();
          }}
          radius="md"
          variant="light"
        >
          필수 3개 한번에 가져오기
        </Button>

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
              const downloadableSlot = isAutoDownloadableSlot(row.slot)
                ? row.slot
                : null;

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
                    {downloadableSlot ? (
                      <Button
                        aria-label={`${row.label} Wing 파일 가져오기`}
                        disabled={downloadingAll || downloadingSlot !== null}
                        loading={downloadingSlot === row.slot}
                        onClick={() => {
                          void handleDownloadFromCoupang(downloadableSlot);
                        }}
                        radius="md"
                        size="compact-xs"
                        variant="light"
                      >
                        <IconCloudDownload size={14} />
                      </Button>
                    ) : null}
                    <Badge color={entry ? 'teal' : 'gray'} radius="xl" variant="light">
                      {entry ? 'OK' : row.required ? 'Need' : 'Optional'}
                    </Badge>
                  </Group>
                </Group>
              );
            })}
          </Stack>
        </Paper>

        {shouldShowValidation ? (
          <Alert color="yellow" radius="lg" title="확인 필요">
            {validation.messages.slice(0, 3).join('\n')}
          </Alert>
        ) : null}

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
            void handleFiles(Array.from(event.currentTarget.files ?? []));
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
            disabled={
              entries.length === 0 ||
              loadingBatch ||
              downloadingAll ||
              uploadMutation.isPending
            }
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              void clearAbrsLedgerBatch(targetDate)
                .then(() => {
                  setEntries([]);
                  setFeedback(null);
                })
                .catch((error) => {
                  setFeedback({
                    color: 'red',
                    title: 'Cache 삭제 실패',
                    message:
                      error instanceof Error
                        ? error.message
                        : '저장된 장부 파일 cache를 삭제하지 못했습니다.',
                  });
                });
            }}
            radius="md"
            variant="default"
          >
            비우기
          </Button>
        </Group>

        <Button
          disabled={!validation.ok || loadingBatch || downloadingAll}
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
