# Remaining user-visible translation pass design

Date: 2026-05-13

## Summary

Finish the remaining internationalization pass for **user-visible/runtime text only**. The goal is to remove leftover hardcoded Chinese text that still appears in the English UI, while intentionally leaving internal-only Chinese content unchanged.

## Scope

### In scope

- `src/components/SettingsModal.tsx`
- `src/store.ts`
- `src/components/TaskGrid.tsx`
- `src/components/ConfirmDialog.tsx`

### Out of scope

- Internal comments
- Test fixture content that intentionally uses Chinese strings
- Mention tokens such as `@图1`
- The custom-provider LLM prompt body itself
- Refactoring unrelated i18n architecture outside the touched runtime strings

## Problem

The current i18n work already covers many shared components, but several runtime strings are still hardcoded in Chinese. As a result, English users can still see untranslated text in settings flows, toasts, confirmations, and task-recovery/error states.

## Goals

1. Ensure the remaining user-visible strings render correctly in English.
2. Preserve existing Chinese behavior.
3. Keep the diff focused on runtime text, not unrelated cleanup.
4. Avoid logic that depends on Chinese wording.

## Non-goals

1. Translating developer comments.
2. Rewriting all historical tests and helper utilities.
3. Translating prompt syntax or special mention labels used by the product.

## Approaches considered

### Option 1: Move every remaining string to `i18n.ts`

Pros:
- Most consistent long-term structure
- Strong key typing for all runtime text

Cons:
- Largest diff
- Slower to finish because `SettingsModal` contains many strings

### Option 2: Finish with `inlineTranslate(...)` for all leftovers

Pros:
- Fastest implementation
- Smallest code movement

Cons:
- Leaves the codebase split between two translation styles
- Less discoverable for future contributors

### Option 3: Hybrid cleanup pass (**recommended**)

Use standard keyed messages in `src/lib/i18n.ts` for shared/runtime strings, and only keep `inlineTranslate(...)` for places where that is already the established local pattern or where moving content into keys would add unnecessary friction.

Pros:
- Good consistency without oversized churn
- Keeps the remaining pass practical
- Aligns with the current codebase, which already uses both keyed and inline translation helpers

Cons:
- Still retains a mixed translation strategy in the short term

## Recommended design

### 1. Add missing translation keys

Add the remaining user-visible English/Chinese message pairs to `src/lib/i18n.ts`, especially for:

- Store error/recovery/toast text
- Missing profile confirmation dialogs
- Full-mask confirmation text
- Settings import/export/clear-data labels
- Settings profile actions and helper text
- Custom-provider modal labels and clipboard/import feedback
- Task-grid drag-select helper toast

### 2. Replace hardcoded runtime strings with translated calls

Use `t(...)` wherever practical in:

- `src/store.ts`
- `src/components/SettingsModal.tsx`
- `src/components/TaskGrid.tsx`

For strings already routed through `inlineTranslate(...)` and clearly local to the current component, it is acceptable to keep that mechanism if it avoids needless churn, but runtime messages shared across flows should prefer `t(...)`.

### 3. Remove wording-dependent destructive detection

`ConfirmDialog.tsx` currently infers destructive state from title text using a regex that includes Chinese words like `删除` and `清空`. This should be replaced with a language-independent rule.

Preferred behavior:
- Respect explicit `confirmDialog.tone` when provided
- Otherwise default to the non-destructive visual treatment

This prevents UI behavior from depending on translated title wording.

### 4. Keep internal-only Chinese content unchanged

Do not translate:

- The custom-provider LLM prompt body
- Mention syntax like `@图1`
- Comments and internal code annotations

This keeps the pass aligned with the requested scope.

## File-level plan

### `src/lib/i18n.ts`

- Add missing message keys for all remaining runtime UI text
- Keep English as the source-of-truth key map
- Add matching Chinese entries

### `src/store.ts`

- Replace hardcoded user-facing strings with `translate(...)` calls
- Cover:
  - timeout/recovery errors
  - Codex CLI detection dialog
  - missing API profile dialogs
  - prompt-required/config-required errors
  - import/export success and failure messages
  - recovered-task notifications

### `src/components/SettingsModal.tsx`

- Replace remaining visible Chinese labels, tooltips, button text, and toasts
- Keep the custom-provider LLM prompt body unchanged
- Continue to use component i18n hooks consistently

### `src/components/TaskGrid.tsx`

- Translate the drag-selection hint toast

### `src/components/ConfirmDialog.tsx`

- Remove title-text regex heuristics
- Base destructive styling on `tone` only

## Testing

1. Run the existing i18n test suite.
2. Extend tests if necessary to assert that the newly covered files no longer expose leftover hardcoded user-visible Chinese text.
3. If needed, add narrow assertions for `SettingsModal` and `store`-driven strings.

## Risks

1. Missing one-off runtime strings in `SettingsModal` because it is large.
2. Accidentally translating internal prompt content that should remain unchanged.
3. Replacing destructive heuristics too broadly and changing dialog styling unexpectedly.

## Mitigations

1. Search specifically for remaining Chinese characters in touched files after implementation.
2. Exclude known intentional regions such as the custom-provider LLM prompt.
3. Keep the `ConfirmDialog` behavior minimal and explicit.

## Acceptance criteria

- English UI no longer shows leftover Chinese runtime text from the in-scope files.
- Chinese UI behavior remains intact.
- Internal-only Chinese content remains unchanged.
- Tests pass after the translation pass.
