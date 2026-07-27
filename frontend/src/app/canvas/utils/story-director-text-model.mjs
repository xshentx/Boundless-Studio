export const STORY_DIRECTOR_TEXT_MODEL_INHERIT =
  "__inherit_story_director_text_model__";

function normalizedAvailableTextModels(availableTextModels) {
  const models = (availableTextModels || [])
    .map((model) => (typeof model === "string" ? model.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(models));
}

function savedStoryDirectorTextModel(metadata) {
  return typeof metadata?.storyDirectorTextModel === "string"
    ? metadata.storyDirectorTextModel.trim()
    : "";
}

export function hasCustomStoryDirectorTextModel(
  metadata,
  availableTextModels = [],
) {
  return (
    metadata?.storyDirectorTextModelMode === "custom" &&
    normalizedAvailableTextModels(availableTextModels).includes(
      savedStoryDirectorTextModel(metadata),
    )
  );
}

export function resolveStoryDirectorTextModel(
  metadata,
  inheritedTextModel,
  availableTextModels = [],
) {
  const models = normalizedAvailableTextModels(availableTextModels);
  if (hasCustomStoryDirectorTextModel(metadata, models)) {
    return savedStoryDirectorTextModel(metadata);
  }
  const inherited = typeof inheritedTextModel === "string"
    ? inheritedTextModel.trim()
    : "";
  return models.includes(inherited) ? inherited : "";
}

export function resolveStoryDirectorTextModelPresentation(
  metadata,
  inheritedTextModel,
  availableTextModels = [],
) {
  const models = normalizedAvailableTextModels(availableTextModels);
  const requestedInherited = typeof inheritedTextModel === "string"
    ? inheritedTextModel.trim()
    : "";
  const inherited = models.includes(requestedInherited) ? requestedInherited : "";
  const inheritLabel = inherited ? `\u7ee7\u627f\uff1a${inherited}` : "";
  const customModel = hasCustomStoryDirectorTextModel(metadata, models)
    ? savedStoryDirectorTextModel(metadata)
    : "";
  const selectedValue = customModel || (inherited ? STORY_DIRECTOR_TEXT_MODEL_INHERIT : "");
  const options = [
    ...(inherited
      ? [{ value: STORY_DIRECTOR_TEXT_MODEL_INHERIT, label: inheritLabel, model: inherited }]
      : []),
    ...models.map((model) => ({ value: model, label: model, model })),
  ];
  return {
    selectedValue,
    options,
    title: selectedValue === STORY_DIRECTOR_TEXT_MODEL_INHERIT
      ? inheritLabel
      : selectedValue || "\u9009\u62e9\u6a21\u578b",
  };
}
