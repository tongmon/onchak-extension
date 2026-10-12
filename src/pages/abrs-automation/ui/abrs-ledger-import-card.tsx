import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactElement,
} from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import {
  IconCloudDownload,
  IconDownload,
  IconExternalLink,
  IconRefresh,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import {
  classifyAbrsLedgerFile,
  ABRS_REQUIRED_LEDGER_SLOTS,
  ABRS_LEDGER_SLOT_DEFINITIONS,
  getAbrsRequiredLedgerSlots,
  isAbrsLedgerSlotPeriodComplete,
  validateAbrsLedgerFiles,
  validateAbrsLedgerPeriod,
  type AbrsLedgerFileEntry,
  type AbrsLedgerFileSlot,
} from "../model/abrs-ledger-files";
import {
  createAbrsLedgerPeriodSelection,
  defaultAbrsLedgerPeriodSelection,
  formatAbrsLedgerDate,
  restoreAbrsLedgerPeriodSelection,
  type AbrsLedgerUploadMode,
} from "../model/abrs-ledger-period-selection";
import {
  persistAbrsLedgerFiles,
  restoreAbrsLedgerEntries,
} from "../model/abrs-ledger-batch-cache";
import {
  clearAbrsLedgerBatch,
  downloadCachedAbrsLedgerFile,
  getAbrsLedgerBatch,
  getAbrsWingSeller,
  getAbrsLedgerSelectedTargetDate,
  saveAbrsLedgerBatchFiles,
  saveAbrsLedgerSelectedTargetDate,
} from "../api/abrs-ledger-batch-runtime";
import { downloadAbrsCoupangLedgerFileFromActiveTab } from "../api/download-abrs-coupang-ledger-file";
import {
  downloadAbrsLedgerBatchWithProgress,
  type AbrsLedgerBatchDownloadResult,
} from "../model/abrs-ledger-batch-progress";
import { useUploadAbrsLedgerImportMutation } from "../api/upload-abrs-ledger-import-mutation";
import type { AbrsCoupangLedgerDownloadSlot } from "@/shared/extension";

interface UploadFeedback {
  color: "green" | "red" | "yellow";
  title: string;
  message: string;
  suppressValidation?: boolean;
  reviewUrl?: string;
}

const SLOT_ROWS = ABRS_REQUIRED_LEDGER_SLOTS.map((slot) => ({
  slot, label: ABRS_LEDGER_SLOT_DEFINITIONS[slot].label,
}));

function isAutoDownloadableSlot(slot: AbrsLedgerFileSlot): slot is AbrsCoupangLedgerDownloadSlot {
  return ABRS_REQUIRED_LEDGER_SLOTS.includes(slot);
}

function getFileNames(files: File[]): string {
  return files.map((file) => file.name).join(", ");
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
  result: AbrsLedgerBatchDownloadResult,
): UploadFeedback {
  const downloaded = result.statuses.filter(
    (status) => status.status === "downloaded",
  );
  const failed = result.statuses.filter((status) => status.status === "failed");

  if (failed.length === 0) {
    return {
      color: "green",
      title: "파일 가져오기 완료",
      message: `${downloaded.length}종 장부 파일을 저장했습니다. 서버 사전 검사를 진행합니다.`,
    };
  }

  if (downloaded.length > 0) {
    return {
      color: "yellow",
      title: "일부 파일 가져오기 완료",
      message: [
        `${downloaded.length}종 파일은 저장했습니다. 누락 파일을 다시 가져온 후 서버로 전송해주세요.`,
        ...failed.map((status) => `${status.slot}: ${status.error}`),
      ].join("\n"),
    };
  }

  return {
    color: "red",
    title: "파일 가져오기 실패",
    message: failed
      .map((status) => `${status.slot}: ${status.error}`)
      .join("\n"),
  };
}

export function AbrsLedgerImportCard(): ReactElement {
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const operationInProgress = useRef(false);
  const selectionRevision = useRef(0);
  const selectionSaveQueue = useRef(Promise.resolve());
  const [uploadMode, setUploadMode] = useState<AbrsLedgerUploadMode>("monthly");
  const [selectedValue, setSelectedValue] = useState(() => defaultAbrsLedgerPeriodSelection().value);
  const latestAllowedMonth = defaultAbrsLedgerPeriodSelection().value;
  const today = formatAbrsLedgerDate(new Date());
  const selection = useMemo(() => createAbrsLedgerPeriodSelection(uploadMode, selectedValue), [uploadMode, selectedValue]);
  const selectionIsAllowed = selection !== null && selectedValue <= (uploadMode === "daily" ? today : latestAllowedMonth);
  const targetDate = selection?.targetDate ?? "";
  const period = selection?.period ?? { start: "", end: "" };
  const periodRequest = { periodStart: period.start, periodEnd: period.end };
  const [collectionProgress, setCollectionProgress] = useState<string | null>(null);
  const [targetDateReady, setTargetDateReady] = useState(false);
  const [entries, setEntries] = useState<AbrsLedgerFileEntry[]>([]);
  const [feedback, setFeedback] = useState<UploadFeedback | null>(null);
  const [downloadingSlot, setDownloadingSlot] =
    useState<AbrsLedgerFileSlot | null>(null);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [savingFiles, setSavingFiles] = useState(false);
  const [clearingBatch, setClearingBatch] = useState(false);
  const [downloadingCached, setDownloadingCached] = useState(false);
  const uploadMutation = useUploadAbrsLedgerImportMutation();
  const busy = !targetDateReady || loadingBatch || downloadingAll || downloadingSlot !== null
    || savingFiles || clearingBatch || downloadingCached || uploadMutation.isPending;
  const requiredSlots = getAbrsRequiredLedgerSlots(period);
  // Older daily caches may contain settlement originals from the previous 13-kind flow.
  // Keep those bytes in storage, but include only this upload unit's kinds in the UI and request.
  const restoreSelectedEntries = (persistedEntries: Parameters<typeof restoreAbrsLedgerEntries>[0]) =>
    restoreAbrsLedgerEntries(persistedEntries.filter((entry) => requiredSlots.includes(entry.slot)));
  const validation = useMemo(
    () => selectionIsAllowed ? validateAbrsLedgerFiles(entries, targetDate, period)
      : { ok: false, messages: [uploadMode === "daily" ? "오늘까지의 업로드 날짜를 선택해 주세요." : "지난달까지의 업로드 월을 선택해 주세요."] },
    [entries, targetDate, period.start, period.end, selectionIsAllowed, uploadMode],
  );
  const entriesBySlot = useMemo(
    () =>
      new Map<AbrsLedgerFileSlot, AbrsLedgerFileEntry>(
        entries.map((entry) => [entry.slot, entry]),
      ),
    [entries],
  );
  const shouldShowValidation = targetDateReady && !loadingBatch && !validation.ok && !feedback?.suppressValidation;
  const requiredEntryCount = selectionIsAllowed
    ? requiredSlots.filter((slot) => isAbrsLedgerSlotPeriodComplete(entries, slot, period)).length : 0;

  const beginOperation = () => {
    if (busy || operationInProgress.current || !selectionIsAllowed) return false;
    operationInProgress.current = true;
    return true;
  };

  useEffect(() => {
    let active = true;
    const fallback = defaultAbrsLedgerPeriodSelection();

    void getAbrsLedgerSelectedTargetDate(fallback.targetDate)
      .then((result) => {
        if (!active) {
          return;
        }

        const restored = restoreAbrsLedgerPeriodSelection(result);
        setUploadMode(restored.mode);
        setSelectedValue(restored.value);
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setUploadMode(fallback.mode);
        setSelectedValue(fallback.value);
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

    if (!targetDateReady || !selectionIsAllowed) {
      setLoadingBatch(false);
      if (targetDateReady) setEntries([]);
      return () => {
        active = false;
      };
    }

    setLoadingBatch(true);
    void getAbrsLedgerBatch(targetDate, periodRequest)
      .then((batch) => {
        if (!active) {
          return;
        }

        setEntries(restoreSelectedEntries(batch.entries));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setEntries([]);
        setFeedback({
          color: "red",
          title: "Cache 불러오기 실패",
          message:
            error instanceof Error
              ? error.message
              : "저장된 장부 파일 cache를 불러오지 못했습니다.",
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
  }, [targetDate, targetDateReady, period.start, period.end, selectionIsAllowed]);

  const handleSelectionChange = (nextMode: AbrsLedgerUploadMode, nextValue: string) => {
    if (busy || operationInProgress.current) return;
    if (nextMode === uploadMode && nextValue === selectedValue) return;
    const revision = ++selectionRevision.current;
    setUploadMode(nextMode);
    setSelectedValue(nextValue);
    setEntries([]);
    setFeedback(null);
    const next = createAbrsLedgerPeriodSelection(nextMode, nextValue);
    if (!next || nextValue > (nextMode === "daily" ? today : latestAllowedMonth)) return;
    setLoadingBatch(true);
    selectionSaveQueue.current = selectionSaveQueue.current.then(async () => {
      if (!mounted.current) return;
      await saveAbrsLedgerSelectedTargetDate(next.targetDate, nextMode);
    }).catch((error) => {
      if (!mounted.current || revision !== selectionRevision.current) return;
      setFeedback({ color: "yellow", title: "선택 기간 저장 실패",
        message: error instanceof Error ? error.message : "선택한 업로드 기간을 저장하지 못했습니다.",
      });
    });
  };

  const persistFiles = async (
    files: File[], replaceSlots: AbrsCoupangLedgerDownloadSlot[] = [],
  ) => {
    if (!mounted.current) throw new Error("계정이 변경되었습니다. 파일을 다시 선택해 주세요.");
    const persistedEntries = await persistAbrsLedgerFiles({
      // Send only new originals; the background merges them with the latest cache under its queue.
      existingEntries: [],
      files,
      targetDate,
      replaceSlots,
    });
    if (!mounted.current) throw new Error("계정이 변경되었습니다. 파일을 다시 선택해 주세요.");
    return saveAbrsLedgerBatchFiles({
      targetDate,
      entries: persistedEntries,
      ...periodRequest,
      replaceSlots,
    });
  };

  const handleFiles = async (
    files: File[], replaceSlots: AbrsCoupangLedgerDownloadSlot[] = [], withinOperation = false,
  ): Promise<boolean> => {
    if (files.length === 0) {
      return true;
    }
    if (!withinOperation && !beginOperation()) return false;
    setSavingFiles(true);

    const unsupportedMessage = createUnsupportedFileMessage(files);
    const acceptedFiles = files.filter((file) => {
      const classification = classifyAbrsLedgerFile(file.name);
      return classification !== null && requiredSlots.includes(classification.slot);
    });
    const outsideModeFiles = files.filter((file) => {
      const classification = classifyAbrsLedgerFile(file.name);
      return classification !== null && !requiredSlots.includes(classification.slot);
    });
    const fileMessage = [unsupportedMessage, outsideModeFiles.length
      ? `선택한 업로드 단위에서 사용하지 않는 파일은 제외했습니다: ${getFileNames(outsideModeFiles)}${uploadMode === "daily" ? ". 정산 리포트는 월별 업로드에서 추가해 주세요." : ""}`
      : null].filter(Boolean).join("\n");
    setFeedback(null);

    try {
      const nextBatch = acceptedFiles.length > 0 ? await persistFiles(acceptedFiles, replaceSlots) : null;
      if (!mounted.current) return false;
      if (nextBatch) setEntries(restoreSelectedEntries(nextBatch.entries));
      setFeedback(
        fileMessage
          ? {
              color: "yellow",
              title: "파일 확인",
              message: fileMessage,
            }
          : null,
      );
      return true;
    } catch (error) {
      if (!mounted.current) return false;
      setFeedback({
        color: "red",
        title: "파일 저장 실패",
        message:
          error instanceof Error
            ? error.message
            : "장부 파일 cache를 저장하지 못했습니다.",
      });
      return false;
    } finally {
      if (mounted.current) setSavingFiles(false);
      if (!withinOperation) operationInProgress.current = false;
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (busy || operationInProgress.current) return;
    void handleFiles(Array.from(event.dataTransfer.files));
  };

  const handleUpload = async (uploadEntries: AbrsLedgerFileEntry[] = entries, withinOperation = false) => {
    if (uploadMutation.isPending || (!withinOperation && !beginOperation())) return;
    setFeedback(null);

    try {
      const result = await uploadMutation.mutateAsync({
        targetDate,
        entries: uploadEntries.filter((entry) => requiredSlots.includes(entry.slot)),
        period,
        uploadMode,
      });
      if (!mounted.current) return;
      if (result.remainingEntries !== null) setEntries(result.remainingEntries);
      setFeedback({
        color: "green",
        title: "업로드 완료",
        message: `${result.importCount}일의 장부를 접수했습니다. 같은 날짜의 기존 내역은 새 파일로 갱신됩니다.${result.remainingEntries === null ? " 저장 원본의 정리는 확인이 필요하여 파일을 보관했습니다." : result.remainingEntries.length ? ` 새로 추가되거나 변경된 원본 ${result.remainingEntries.length}개는 보관했습니다.` : ""} ${result.workflow?.needsRecalculation === false ? "현재 계산 결과를 웹에서 확인해 주세요." : "웹에서 입력과 매핑을 검토하고 계산을 완료해 주세요."}`,
        reviewUrl: result.reviewUrl,
        suppressValidation: true,
      });
    } catch (error) {
      if (!mounted.current) return;
      setFeedback({
        color: "red",
        title: "업로드 실패",
        message:
          error instanceof Error
            ? error.message
            : "장부 데이터를 업로드하지 못했습니다.",
      });
    } finally {
      if (!withinOperation) operationInProgress.current = false;
    }
  };

  const handleDownloadFromCoupang = async (
    slot: AbrsCoupangLedgerDownloadSlot,
  ) => {
    if (!requiredSlots.includes(slot) || !beginOperation()) return;
    setFeedback(null);
    setDownloadingSlot(slot);

    try {
      const files = await downloadAbrsCoupangLedgerFileFromActiveTab({
        slot, targetDate, ...periodRequest,
      });
      if (files.length === 0) throw new Error("조회 기간에 생성된 보고서가 없습니다.");
      for (const file of files) {
        if (classifyAbrsLedgerFile(file.name)?.slot !== slot) {
          throw new Error(`요청한 종류와 다른 파일입니다: ${file.name}`);
        }
      }
      const saved = await handleFiles(files, [slot], true);

      if (!saved || !mounted.current) {
        return;
      }

      setFeedback({
        color: "green",
        title: "파일 가져오기 완료",
        message: `${getFileNames(files)} 파일을 추가했습니다.`,
      });
    } catch (error) {
      if (!mounted.current) return;
      setFeedback({
        color: "red",
        title: "파일 가져오기 실패",
        message:
          error instanceof Error
            ? error.message
            : "Coupang Wing 파일을 가져오지 못했습니다.",
      });
    } finally {
      operationInProgress.current = false;
      if (mounted.current) setDownloadingSlot(null);
    }
  };

  const handleDownloadAllFromCoupang = async () => {
    if (!beginOperation()) return;
    const periodErrors = validateAbrsLedgerPeriod(targetDate, period);
    if (periodErrors.length) {
      setFeedback({ color: "yellow", title: "조회 기간 확인", message: periodErrors.join("\n") });
      operationInProgress.current = false;
      return;
    }
    setFeedback(null);
    setDownloadingAll(true);
    setCollectionProgress(`${requiredSlots.length}종 파일 수집을 시작합니다.`);

    try {
      const { sellerId } = await getAbrsWingSeller();
      const initialBatch = await getAbrsLedgerBatch(targetDate, periodRequest);
      const result = await downloadAbrsLedgerBatchWithProgress({
        targetDate,
        initialBatch,
        expectedSellerId: sellerId,
        ...periodRequest,
        downloadSlot: downloadAbrsCoupangLedgerFileFromActiveTab,
        persistFiles: async (files, slot) => {
          for (const file of files) {
            if (classifyAbrsLedgerFile(file.name)?.slot !== slot) throw new Error(`요청한 종류와 다른 파일입니다: ${file.name}`);
          }
          return persistFiles(files, [slot]);
        },
        onProgress: ({ batch, completedCount, totalCount, status }) => {
          if (!mounted.current) return;
          setEntries(restoreSelectedEntries(batch.entries));
          setCollectionProgress(`${completedCount}/${totalCount}종 · ${ABRS_LEDGER_SLOT_DEFINITIONS[status.slot].label}`);
        },
      });

      const collectedEntries = restoreSelectedEntries(result.batch.entries);
      if (!mounted.current) throw new Error("계정이 변경되었습니다. 파일을 다시 선택해 주세요.");
      setEntries(collectedEntries);
      const collectedValidation = validateAbrsLedgerFiles(collectedEntries, targetDate, period);
      if (result.statuses.every((status) => status.status === "downloaded") && collectedValidation.ok) {
        setCollectionProgress(`${requiredSlots.length}종 수집 완료 · 서버 사전 검사 및 전송 중`);
        await handleUpload(collectedEntries, true);
      } else {
        const downloadFeedback = createDownloadAllFeedback(result);
        setFeedback(collectedValidation.ok || result.statuses.some((status) => status.status === "failed")
          ? downloadFeedback
          : { color: "yellow", title: "파일 기간 확인 필요", message: collectedValidation.messages.join("\n") });
      }
    } catch (error) {
      if (!mounted.current) return;
      setFeedback({
        color: "red",
        title: "파일 가져오기 실패",
        message:
          error instanceof Error
            ? error.message
            : "Coupang 장부 파일을 가져오지 못했습니다.",
      });
    } finally {
      operationInProgress.current = false;
      if (mounted.current) {
        setDownloadingAll(false);
        setCollectionProgress(null);
      }
    }
  };

  const handleDownloadCachedFile = async (slot: AbrsLedgerFileSlot, fileName?: string) => {
    if (!beginOperation()) return;
    setDownloadingCached(true);
    setFeedback(null);

    try {
      const result = await downloadCachedAbrsLedgerFile({ targetDate, slot, fileName, ...periodRequest });
      if (!mounted.current) return;
      setFeedback({
        color: "green",
        title: "파일 다운로드 시작",
        message: `${result.fileName} 파일 다운로드를 시작했습니다.`,
      });
    } catch (error) {
      if (!mounted.current) return;
      setFeedback({
        color: "red",
        title: "파일 다운로드 실패",
        message:
          error instanceof Error
            ? error.message
            : "저장된 장부 파일을 다운로드하지 못했습니다.",
      });
    } finally {
      operationInProgress.current = false;
      if (mounted.current) setDownloadingCached(false);
    }
  };

  const handleClear = async () => {
    if (!beginOperation()) return;
    setClearingBatch(true);
    try {
      await clearAbrsLedgerBatch(targetDate, periodRequest);
      if (!mounted.current) return;
      setEntries([]);
      setFeedback(null);
    } catch (error) {
      if (!mounted.current) return;
      setFeedback({ color: "red", title: "저장 파일 삭제 실패",
        message: error instanceof Error ? error.message : "저장된 장부 파일을 삭제하지 못했습니다." });
    } finally {
      operationInProgress.current = false;
      if (mounted.current) setClearingBatch(false);
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
          <Badge
            color={selectionIsAllowed && requiredEntryCount === requiredSlots.length ? "teal" : entries.length ? "yellow" : "gray"}
            radius="xl"
            variant="light"
          >
            {loadingBatch ? "불러오는 중" : `${requiredEntryCount}/${requiredSlots.length}종 · 원본 ${entries.length}개`}
          </Badge>
        </Group>

        <Stack gap={6}>
          <Text id="abrs-upload-mode-label" fw={500} size="sm">업로드 단위</Text>
          <SegmentedControl<AbrsLedgerUploadMode>
            aria-labelledby="abrs-upload-mode-label"
            data={[{ value: "daily", label: "일별 업로드" }, { value: "monthly", label: "월별 업로드" }]}
            disabled={busy}
            fullWidth
            onChange={(mode) => {
              const nextMonth = selectedValue.slice(0, 7);
              handleSelectionChange(mode, mode === "daily" ? targetDate || today : nextMonth && nextMonth <= latestAllowedMonth ? nextMonth : latestAllowedMonth);
            }}
            radius="md"
            value={uploadMode}
          />
        </Stack>
        <TextInput
          key={uploadMode}
          disabled={busy}
          label={uploadMode === "daily" ? "업로드 날짜" : "업로드 월"}
          max={uploadMode === "daily" ? today : latestAllowedMonth}
          onChange={(event) => handleSelectionChange(uploadMode, event.currentTarget.value)}
          radius="md"
          type={uploadMode === "daily" ? "date" : "month"}
          value={selectedValue}
        />
        <Stack gap={4}>
          <Text size="sm">{selectionIsAllowed ? `대상 기간: ${period.start}${uploadMode === "monthly" ? ` ~ ${period.end}` : " (하루)"}` : "업로드할 날짜 또는 월을 선택해 주세요."}</Text>
          <Text c="dimmed" size="xs">{uploadMode === "daily"
            ? "판매·광고는 선택한 날짜의 자료를 가져옵니다. 정산 9종은 월별 업로드에서 수집합니다."
            : "지난달까지 선택할 수 있습니다. 판매 현황은 날짜별 원본, 광고는 일별·전체 캠페인·상품 단위, 정산은 매출인식일 기준으로 가져옵니다."}</Text>
          <Text c="dimmed" size="xs">재고 현황·상품 리스트는 가져오는 시점의 현황입니다.</Text>
          {uploadMode === "monthly" ? <Text c="dimmed" size="xs">13종에는 여러 날짜·정산 건의 원본이 포함됩니다. 원본 개수는 13개보다 많을 수 있습니다.</Text> : null}
          <Text c="dimmed" size="xs">이미 올린 같은 내역은 중복 합산하지 않고 새 파일로 갱신합니다. 제공되지 않은 자료는 누락으로 표시합니다.</Text>
        </Stack>
        <Button
          disabled={busy || !selectionIsAllowed}
          leftSection={<IconCloudDownload size={16} />}
          loading={downloadingAll}
          onClick={() => {
            void handleDownloadAllFromCoupang();
          }}
          radius="md"
          variant="light"
        >
          {requiredSlots.length}종 가져오기 및 서버 전송
        </Button>

        {collectionProgress ? <Text role="status" size="sm">{collectionProgress}</Text> : null}
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
              const required = requiredSlots.includes(row.slot);
              const entry = entriesBySlot.get(row.slot);
              const complete = required && selectionIsAllowed && isAbrsLedgerSlotPeriodComplete(entries, row.slot, period);
              const slotEntries = entries.filter((item) => item.slot === row.slot);
              const downloadableSlot = isAutoDownloadableSlot(row.slot)
                ? row.slot
                : null;

              return (
                <Stack key={row.slot} gap={6} style={{ minWidth: 0 }}>
                  <Group gap="xs" justify="space-between" wrap="nowrap">
                    <Text fw={600} size="sm" style={{ flex: 1, minWidth: 0 }}>
                      {row.label}
                    </Text>
                    <Badge
                      color={entry ? complete ? "teal" : "yellow" : "gray"}
                      radius="xl"
                      style={{ flexShrink: 0 }}
                      variant="light"
                    >
                      {entry ? complete ? "저장됨" : "기간 확인 필요" : required ? "파일 없음" : "월별 수집"}
                    </Badge>
                  </Group>
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    {entry ? slotEntries.map((item) => (
                      <Text key={item.file.name} lineClamp={1} size="xs" title={item.file.name}>{item.file.name}</Text>
                    )) : <Text c="dimmed" size="xs">{required ? "파일 없음" : "월별 업로드에서 정산 건별로 수집합니다."}</Text>}
                    {slotEntries.length > 1 ? slotEntries.map((item, index) => (
                      <Button key={item.file.name} disabled={busy} size="compact-xs" variant="subtle" onClick={() => { void handleDownloadCachedFile(row.slot, item.file.name); }}>
                        {index + 1}번 원본 다운로드
                      </Button>
                    )) : null}
                  </Stack>
                  <Group gap="xs">
                    {downloadableSlot ? (
                      <Tooltip label="쿠팡에서 원본 파일을 새로 가져옵니다">
                        <Button
                          aria-label={`${row.label} Coupang에서 가져오기`}
                          disabled={busy || !required || !selectionIsAllowed}
                          leftSection={<IconCloudDownload size={16} />}
                          loading={downloadingSlot === row.slot}
                          onClick={() => {
                            void handleDownloadFromCoupang(downloadableSlot);
                          }}
                          radius="md"
                          size="xs"
                          style={{ flexShrink: 0 }}
                          variant="light"
                        >
                          가져오기
                        </Button>
                      </Tooltip>
                    ) : null}
                    {entry ? (
                      <Tooltip label="확장 프로그램에 저장된 원본 파일을 PC에 다운로드합니다">
                        <Button
                          aria-label={`${row.label} 저장 파일 다운로드`}
                          disabled={busy}
                          leftSection={<IconDownload size={16} />}
                          onClick={() => {
                            void handleDownloadCachedFile(row.slot, entry.file.name);
                          }}
                          radius="md"
                          size="xs"
                          style={{ flexShrink: 0 }}
                          variant="subtle"
                        >
                          파일 다운로드
                        </Button>
                      </Tooltip>
                    ) : null}
                  </Group>
                </Stack>
              );
            })}
          </Stack>
        </Paper>

        {shouldShowValidation ? (
          <Alert color="yellow" radius="lg" title="확인 필요">
            {validation.messages.slice(0, 3).join("\n")}
          </Alert>
        ) : null}

        {feedback ? (
          <Alert color={feedback.color} radius="lg" title={feedback.title}>
            {feedback.message}
            {feedback.reviewUrl ? (
              <Button
                component="a"
                href={feedback.reviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                mt="sm"
                variant="light"
              >
                웹에서 장부 검토
              </Button>
            ) : null}
          </Alert>
        ) : null}

        <input
          ref={inputRef}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          hidden
          multiple
          onChange={(event) => {
            void handleFiles(Array.from(event.currentTarget.files ?? []));
            event.currentTarget.value = "";
          }}
          type="file"
        />

        <Group grow gap="xs">
          <Button
            leftSection={<IconUpload size={16} />}
            disabled={busy || !selectionIsAllowed}
            onClick={() => inputRef.current?.click()}
            radius="md"
            variant="default"
          >
            파일 추가
          </Button>
          <Button
            disabled={entries.length === 0 || busy}
            loading={clearingBatch}
            leftSection={<IconTrash size={16} />}
            onClick={() => {
              void handleClear();
            }}
            radius="md"
            variant="default"
          >
            비우기
          </Button>
        </Group>

        <Button
          disabled={!validation.ok || busy}
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
