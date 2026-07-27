import type { CanvasNodeMetadata } from "../types";

export const STORY_DIRECTOR_TEXT_MODEL_INHERIT =
  "__inherit_story_director_text_model__";

export type StoryDirectorTextModelOption = {
  value: string;
  label: string;
  model?: string;
};

function normalizedAvailableTextModels(
  availableTextModels: readonly unknown[] | undefined,
) {
  const models = (availableTextModels || [])
    .map((model) => (typeof model === "string" ? model.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(models));
}

function savedStoryDirectorTextModel(metadata?: Partial<CanvasNodeMetadata>) {
  return typeof metadata?.storyDirectorTextModel === "string"
    ? metadata.storyDirectorTextModel.trim()
    : "";
}

export function hasCustomStoryDirectorTextModel(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  availableTextModels: readonly unknown[] = [],
) {
  return (
    metadata?.storyDirectorTextModelMode === "custom" &&
    normalizedAvailableTextModels(availableTextModels).includes(
      savedStoryDirectorTextModel(metadata),
    )
  );
}

export function resolveStoryDirectorTextModel(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  inheritedTextModel: unknown,
  availableTextModels: readonly unknown[] = [],
) {
  const models = normalizedAvailableTextModels(availableTextModels);
  if (hasCustomStoryDirectorTextModel(metadata, models)) {
    return savedStoryDirectorTextModel(metadata);
  }
  const inherited = typeof inheritedTextModel === "string" ? inheritedTextModel.trim() : "";
  return models.includes(inherited) ? inherited : "";
}

export function resolveStoryDirectorTextModelPresentation(
  metadata: Partial<CanvasNodeMetadata> | undefined,
  inheritedTextModel: unknown,
  availableTextModels: readonly unknown[] = [],
) {
  const models = normalizedAvailableTextModels(availableTextModels);
  const requestedInherited = typeof inheritedTextModel === "string" ? inheritedTextModel.trim() : "";
  const inherited = models.includes(requestedInherited) ? requestedInherited : "";
  const inheritLabel = inherited ? `继承：${inherited}` : "";
  const customModel = hasCustomStoryDirectorTextModel(metadata, models)
    ? savedStoryDirectorTextModel(metadata)
    : "";
  const selectedValue = customModel || (inherited ? STORY_DIRECTOR_TEXT_MODEL_INHERIT : "");
  const options: StoryDirectorTextModelOption[] = [
    ...(inherited ? [{ value: STORY_DIRECTOR_TEXT_MODEL_INHERIT, label: inheritLabel, model: inherited }] : []),
    ...models.map((model) => ({ value: model, label: model, model })),
  ];
  return {
    selectedValue,
    options,
    title:
      selectedValue === STORY_DIRECTOR_TEXT_MODEL_INHERIT
        ? inheritLabel
        : selectedValue || "选择模型",
  };
}
