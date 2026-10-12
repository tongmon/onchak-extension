import type { AbrsCoupangLedgerDownloadSlot, AbrsLedgerPersistedEntry } from '../../../shared/extension/messaging/contracts.ts';
import { ABRS_LEDGER_SLOT_DEFINITIONS, classifyAbrsLedgerFile } from '../../../pages/abrs-automation/model/abrs-ledger-files.ts';
import { isAbrsLedgerXlsxPayload } from '../../../pages/abrs-automation/api/abrs-coupang-download-file.ts';
import { resolveAbrsLedgerSellerId } from '../../../pages/abrs-automation/model/abrs-ledger-seller.ts';

/** Remove an old slot only after a complete, classified replacement exists in the incoming payload. */
export function filterAbrsLedgerEntriesForReplacement(
  existing: AbrsLedgerPersistedEntry[], incoming: AbrsLedgerPersistedEntry[], replaceSlots?: AbrsCoupangLedgerDownloadSlot[],
): AbrsLedgerPersistedEntry[] {
  resolveAbrsLedgerSellerId([...existing, ...incoming]);
  if (replaceSlots === undefined) return existing;
  const invalid = () => new Error('교체할 장부 종류와 새 Excel 원본을 확인해주세요.');
  if (!Array.isArray(replaceSlots) || !Array.isArray(incoming)) throw invalid();
  const slots = new Set(replaceSlots);
  for (const slot of slots) {
    if (!Object.hasOwn(ABRS_LEDGER_SLOT_DEFINITIONS, slot)) throw invalid();
    const replacements = incoming.filter((entry) => entry.slot === slot);
    if (!replacements.length || replacements.some((entry) => {
      const classification = classifyAbrsLedgerFile(entry.fileName);
      return classification?.slot !== slot || classification.sourceType !== entry.sourceType
        || entry.size <= 0 || !isAbrsLedgerXlsxPayload(entry, entry.size);
    })) throw invalid();
  }
  return existing.filter((entry) => !slots.has(entry.slot));
}
